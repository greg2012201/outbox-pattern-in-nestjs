import { Test, TestingModule } from '@nestjs/testing';
import { RmqContext } from '@nestjs/microservices';
import { InboxMessageProcessor, RmqMessageDeliveryFactory } from '@app/messaging';
import { PaymentCompletedConsumer } from './payment-completed.consumer';
import { PaymentCompletedEmailHandler } from '../handlers/payment-completed.handler';

describe('PaymentCompletedConsumer', () => {
  let consumer: PaymentCompletedConsumer;
  let inboxMessageProcessor: InboxMessageProcessor;
  let rmqMessageDeliveryFactory: RmqMessageDeliveryFactory;
  let paymentCompletedHandler: PaymentCompletedEmailHandler;

  const message = {
    id: 'event-123',
    aggregateId: 'order-123',
    eventType: 'payment.completed',
    timestamp: new Date(),
    data: {},
    version: 1,
    paymentId: 'payment-123',
    orderId: 'order-123',
    amount: 100,
    currency: 'USD',
    transactionId: 'txn_123',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentCompletedConsumer],
      providers: [
        {
          provide: InboxMessageProcessor,
          useValue: { process: jest.fn() },
        },
        {
          provide: PaymentCompletedEmailHandler,
          useValue: {},
        },
        {
          provide: RmqMessageDeliveryFactory,
          useValue: { create: jest.fn() },
        },
      ],
    }).compile();

    consumer = module.get<PaymentCompletedConsumer>(PaymentCompletedConsumer);
    inboxMessageProcessor = module.get<InboxMessageProcessor>(InboxMessageProcessor);
    paymentCompletedHandler = module.get<PaymentCompletedEmailHandler>(
      PaymentCompletedEmailHandler
    );
    rmqMessageDeliveryFactory = module.get<RmqMessageDeliveryFactory>(RmqMessageDeliveryFactory);
  });

  it('delegates message processing to the inbox processor', async () => {
    const context = {} as RmqContext;
    const delivery = { ack: jest.fn(), nack: jest.fn() };
    jest.spyOn(rmqMessageDeliveryFactory, 'create').mockReturnValue(delivery);

    await consumer.handlePaymentCompleted(message, context);

    expect(inboxMessageProcessor.process).toHaveBeenCalledWith({
      message,
      handler: paymentCompletedHandler,
      delivery,
    });
  });
});
