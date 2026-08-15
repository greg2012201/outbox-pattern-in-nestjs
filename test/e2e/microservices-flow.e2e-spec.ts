/// <reference types="jest" />
import { INestApplication } from '@nestjs/common';
import { INestMicroservice } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { DataSource } from 'typeorm';
import { connect } from 'amqplib';
import { PaymentService } from '../../apps/payment-service/src/services/payment.service';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RabbitMQContainer } from '@testcontainers/rabbitmq';
import { getRabbitMQConfig } from '../../libs/messaging/src/rabbitmq-config';
import { InboxMessage, InboxMessageStatus, OutboxEvent, OutboxEventStatus } from '@app/database';

type StartedPostgres = Awaited<ReturnType<PostgreSqlContainer['start']>>;
type StartedRabbit = Awaited<ReturnType<RabbitMQContainer['start']>>;

const waitFor = async (condition: () => Promise<boolean>, timeout = 30000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for the expected microservices state');
};

describe('microservices outbox and inbox flow (e2e)', () => {
  let rabbit: StartedRabbit;
  let databases: Record<string, StartedPostgres>;
  let orderService: INestApplication;
  let apiGateway: INestApplication;
  let paymentService: INestMicroservice;
  let notificationService: INestMicroservice;
  let emailService: INestMicroservice;
  let apiGatewayModule: typeof import('../../apps/api-gateway/src/app.module');
  let orderServiceModule: typeof import('../../apps/order-service/src/app.module');
  let paymentServiceModule: typeof import('../../apps/payment-service/src/app.module');
  let notificationServiceModule: typeof import('../../apps/notification-service/src/app.module');
  let emailServiceModule: typeof import('../../apps/email-service/src/app.module');
  let orderServiceUrl: string;

  const databaseEnvironment = (database: StartedPostgres) => ({
    DATABASE_HOST: database.getHost(),
    DATABASE_PORT: String(database.getPort()),
    DATABASE_USERNAME: database.getUsername(),
    DATABASE_PASSWORD: database.getPassword(),
    DATABASE_NAME: database.getDatabase(),
    NODE_ENV: 'development',
  });

  const databaseConnection = (database: StartedPostgres) => ({
    type: 'postgres' as const,
    host: database.getHost(),
    port: database.getPort(),
    username: database.getUsername(),
    password: database.getPassword(),
    database: database.getDatabase(),
    entities: [OutboxEvent, InboxMessage],
  });

  const setEnvironment = (database: StartedPostgres) => {
    Object.assign(process.env, databaseEnvironment(database), {
      RABBITMQ_URL: [
        'amqp://',
        'guest',
        ':',
        'guest',
        '@',
        rabbit.getHost(),
        ':',
        rabbit.getMappedPort(5672),
      ].join(''),
      RABBITMQ_MAX_DELIVERIES: '3',
      INBOX_MAX_ATTEMPTS: '3',
    });
  };

  const startConsumer = async (
    module:
      | typeof import('../../apps/payment-service/src/app.module').PaymentServiceModule
      | typeof import('../../apps/notification-service/src/app.module').NotificationServiceModule
      | typeof import('../../apps/email-service/src/app.module').EmailServiceModule,
    database: StartedPostgres,
    queue: string,
    exchange?: string
  ) => {
    setEnvironment(database);
    return NestFactory.createMicroservice<MicroserviceOptions>(
      module,
      getRabbitMQConfig({ queue, exchange, noAck: false })
    );
  };

  beforeAll(async () => {
    [rabbit, databases] = await Promise.all([
      new RabbitMQContainer('rabbitmq:3.12-management-alpine').start(),
      Promise.all(
        ['order', 'payment', 'notification', 'email'].map(async (name) => [
          name,
          await new PostgreSqlContainer('postgres:15-alpine')
            .withDatabase(`${name}_db`)
            .withUsername(`${name}_user`)
            .withPassword(`${name}_pass`)
            .start(),
        ])
      ).then((entries) => Object.fromEntries(entries) as Record<string, StartedPostgres>),
    ]);

    setEnvironment(databases.order);
    apiGatewayModule = await import('../../apps/api-gateway/src/app.module');
    orderServiceModule = await import('../../apps/order-service/src/app.module');
    orderService = await NestFactory.create(orderServiceModule.OrderServiceModule);
    await orderService.listen(0);
    const orderPort = (orderService.getHttpServer().address() as { port: number }).port;
    orderServiceUrl = `http://127.0.0.1:${orderPort}`;

    setEnvironment(databases.payment);
    paymentServiceModule = await import('../../apps/payment-service/src/app.module');
    paymentService = await startConsumer(
      paymentServiceModule.PaymentServiceModule,
      databases.payment,
      'payment_service_queue'
    );
    setEnvironment(databases.notification);
    notificationServiceModule = await import('../../apps/notification-service/src/app.module');
    notificationService = await startConsumer(
      notificationServiceModule.NotificationServiceModule,
      databases.notification,
      'notification_service_queue',
      'payment.events'
    );
    setEnvironment(databases.email);
    emailServiceModule = await import('../../apps/email-service/src/app.module');
    emailService = await startConsumer(
      emailServiceModule.EmailServiceModule,
      databases.email,
      'email_service_queue',
      'payment.events'
    );
    await Promise.all([
      paymentService.listen(),
      notificationService.listen(),
      emailService.listen(),
    ]);

    process.env.ORDER_SERVICE_URL = orderServiceUrl;
    apiGateway = await NestFactory.create(apiGatewayModule.AppModule);
    await apiGateway.listen(0);
  });

  afterAll(async () => {
    await Promise.all([
      apiGateway?.close(),
      orderService?.close(),
      paymentService?.close(),
      notificationService?.close(),
      emailService?.close(),
    ]);
    await Promise.all(Object.values(databases ?? {}).map((database) => database.stop()));
    await rabbit?.stop();
  });

  it('processes an order through every service and marks outbox/inbox records complete', async () => {
    const apiPort = (apiGateway.getHttpServer().address() as { port: number }).port;
    const idempotencyKey = '4f2f4f7b-1e32-4d22-a8f6-7d31b7bd0b45';
    const response = await fetch(`http://127.0.0.1:${apiPort}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({
        userId: 'e2e-user',
        totalAmount: 25,
        currency: 'USD',
        items: [{ productId: 'product-1', quantity: 1, unitPrice: 25 }],
      }),
    });
    expect(response.status).toBe(201);
    const order = (await response.json()) as { id: string };

    await waitFor(async () => {
      const orderOutbox = await new DataSource(databaseConnection(databases.order)).initialize();
      const paymentOutbox = await new DataSource(
        databaseConnection(databases.payment)
      ).initialize();
      const orderSent = await orderOutbox.getRepository(OutboxEvent).existsBy({
        aggregateId: order.id,
        status: OutboxEventStatus.SENT,
      });
      const paymentSent = (
        await paymentOutbox.getRepository(OutboxEvent).find({
          where: { status: OutboxEventStatus.SENT },
        })
      ).some((event) => event.payload.orderId === order.id);
      await orderOutbox.destroy();
      await paymentOutbox.destroy();
      return orderSent && paymentSent;
    });

    const notificationInbox = await new DataSource(
      databaseConnection(databases.notification)
    ).initialize();
    await waitFor(async () => {
      const count = await notificationInbox
        .getRepository(InboxMessage)
        .countBy({ status: InboxMessageStatus.PROCESSED });
      return count > 0;
    });
    const notificationProcessed = await notificationInbox
      .getRepository(InboxMessage)
      .countBy({ status: InboxMessageStatus.PROCESSED });
    expect(notificationProcessed).toBe(1);
    await notificationInbox.destroy();

    const emailInbox = await new DataSource(databaseConnection(databases.email)).initialize();
    expect(
      await emailInbox.getRepository(InboxMessage).countBy({ status: InboxMessageStatus.PROCESSED })
    ).toBe(1);
    await emailInbox.destroy();
  });

  it('rejects invalid idempotency keys and replays a duplicate request without creating another order', async () => {
    const body = JSON.stringify({
      userId: 'negative-user',
      totalAmount: 10,
      currency: 'EUR',
      items: [],
    });
    const invalid = await fetch(`${orderServiceUrl}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'not-a-uuid' },
      body,
    });
    expect(invalid.status).toBe(422);

    const key = 'f3f7b4f9-7588-4e7a-9f86-bc0fdfb99a7e';
    const first = await fetch(`${orderServiceUrl}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
      body,
    });
    const second = await fetch(`${orderServiceUrl}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
      body,
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers.get('x-idempotency-replayed')).toBe('true');
    const firstOrder = (await first.json()) as { id: string };
    const secondOrder = (await second.json()) as { id: string };
    expect(firstOrder.id).toBe(secondOrder.id);
  });

  it('persists a failed payment and publishes its failed outbox event', async () => {
    const payment = paymentService.get(PaymentService);
    const provider = jest
      .spyOn(payment as never, 'callPaymentProvider' as never)
      .mockResolvedValue({
        success: false,
        error: 'forced e2e provider failure',
      } as never);
    const key = '9f9f4d6d-0e3e-45f6-9f38-1ed2d7f5e0d7';
    const response = await fetch(`${orderServiceUrl}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({
        userId: 'failed-payment-user',
        totalAmount: 15,
        currency: 'GBP',
        items: [],
      }),
    });
    expect(response.status).toBe(201);
    const order = (await response.json()) as { id: string };

    const paymentOutbox = await new DataSource(databaseConnection(databases.payment)).initialize();
    await waitFor(async () => {
      const events = await paymentOutbox.getRepository(OutboxEvent).find({
        where: { eventType: 'PaymentFailed' },
      });
      return events.some(
        (event) => event.payload.orderId === order.id && event.status === OutboxEventStatus.SENT
      );
    });
    expect(
      (
        await paymentOutbox
          .getRepository(OutboxEvent)
          .find({ where: { eventType: 'PaymentFailed' } })
      ).some((event) => event.payload.orderId === order.id)
    ).toBe(true);
    await paymentOutbox.destroy();
    provider.mockRestore();
  });

  it('dead-letters an inbox message that has no message id', async () => {
    const broker = await connect(process.env.RABBITMQ_URL);
    const channel = await broker.createChannel();
    await channel.sendToQueue(
      'payment_service_queue',
      Buffer.from(JSON.stringify({ orderId: 'poison' })),
      {
        persistent: true,
      }
    );
    await waitFor(
      async () => (await channel.checkQueue('payment_service_queue.dlq')).messageCount > 0
    );
    expect((await channel.checkQueue('payment_service_queue.dlq')).messageCount).toBeGreaterThan(0);
    await channel.close();
    await broker.close();
  });
});
