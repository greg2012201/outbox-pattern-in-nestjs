import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { DataSource } from 'typeorm';
import { PostgreSqlContainer, RabbitMQContainer } from 'testcontainers';
import { AppModule as ApiGatewayModule } from '../../apps/api-gateway/src/app.module';
import { OrderServiceModule } from '../../apps/order-service/src/app.module';
import { PaymentServiceModule } from '../../apps/payment-service/src/app.module';
import { NotificationServiceModule } from '../../apps/notification-service/src/app.module';
import { EmailServiceModule } from '../../apps/email-service/src/app.module';
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
  let paymentService: ReturnType<typeof NestFactory.createMicroservice>;
  let notificationService: ReturnType<typeof NestFactory.createMicroservice>;
  let emailService: ReturnType<typeof NestFactory.createMicroservice>;

  const databaseEnvironment = (database: StartedPostgres) => ({
    DATABASE_HOST: database.getHost(),
    DATABASE_PORT: String(database.getPort()),
    DATABASE_USERNAME: database.getUsername(),
    DATABASE_PASSWORD: database.getUserPassword(),
    DATABASE_NAME: database.getDatabase(),
    NODE_ENV: 'development',
  });

  const setEnvironment = (database: StartedPostgres) => {
    Object.assign(process.env, databaseEnvironment(database), {
      RABBITMQ_URL: `amqp://${rabbit.getUsername()}:${rabbit.getPassword()}@${rabbit.getHost()}:${rabbit.getMappedPort(5672)}`,
      RABBITMQ_MAX_DELIVERIES: '3',
      INBOX_MAX_ATTEMPTS: '3',
    });
  };

  const startConsumer = async (
    module: typeof PaymentServiceModule | typeof NotificationServiceModule | typeof EmailServiceModule,
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
    orderService = await NestFactory.create(OrderServiceModule);
    await orderService.listen(0);
    const orderPort = (orderService.getHttpServer().address() as { port: number }).port;

    paymentService = await startConsumer(PaymentServiceModule, databases.payment, 'payment_service_queue');
    notificationService = await startConsumer(
      NotificationServiceModule,
      databases.notification,
      'notification_service_queue',
      'payment.events'
    );
    emailService = await startConsumer(EmailServiceModule, databases.email, 'email_service_queue', 'payment.events');
    await Promise.all([paymentService.listen(), notificationService.listen(), emailService.listen()]);

    process.env.ORDER_SERVICE_URL = `http://127.0.0.1:${orderPort}`;
    apiGateway = await NestFactory.create(ApiGatewayModule);
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
      const orderOutbox = await new DataSource({
        type: 'postgres',
        ...databaseEnvironment(databases.order),
        entities: [OutboxEvent],
      }).initialize();
      const paymentOutbox = await new DataSource({
        type: 'postgres',
        ...databaseEnvironment(databases.payment),
        entities: [OutboxEvent],
      }).initialize();
      const complete = await orderOutbox.getRepository(OutboxEvent).existsBy({
        aggregateId: order.id,
        status: OutboxEventStatus.SENT,
      }) && await paymentOutbox.getRepository(OutboxEvent).existsBy({ aggregateId: order.id, status: OutboxEventStatus.SENT });
      await orderOutbox.destroy();
      await paymentOutbox.destroy();
      return complete;
    });

    const notificationInbox = await new DataSource({
      type: 'postgres',
      ...databaseEnvironment(databases.notification),
      entities: [InboxMessage],
    }).initialize();
    await waitFor(async () => {
      const count = await notificationInbox.getRepository(InboxMessage).countBy({ status: InboxMessageStatus.PROCESSED });
      return count > 0;
    });
    expect(await notificationInbox.getRepository(InboxMessage).countBy({ status: InboxMessageStatus.PROCESSED })).toBeGreaterThan(0);
    await notificationInbox.destroy();

    const emailInbox = await new DataSource({
      type: 'postgres',
      ...databaseEnvironment(databases.email),
      entities: [InboxMessage],
    }).initialize();
    expect(await emailInbox.getRepository(InboxMessage).countBy({ status: InboxMessageStatus.PROCESSED })).toBeGreaterThan(0);
    await emailInbox.destroy();
  });

  it('rejects invalid idempotency keys and replays a duplicate request without creating another order', async () => {
    const apiPort = (apiGateway.getHttpServer().address() as { port: number }).port;
    const body = JSON.stringify({ userId: 'negative-user', totalAmount: 10, currency: 'EUR', items: [] });
    const invalid = await fetch(`http://127.0.0.1:${apiPort}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'not-a-uuid' },
      body,
    });
    expect(invalid.status).toBe(400);

    const key = 'f3f7b4f9-7588-4e7a-9f86-bc0fdfb99a7e';
    const first = await fetch(`http://127.0.0.1:${apiPort}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
      body,
    });
    const second = await fetch(`http://127.0.0.1:${apiPort}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
      body,
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers.get('x-idempotency-replayed')).toBe('true');
    expect((await first.json()).id).toBe((await second.json()).id);
  });
});
