import { Test, TestingModule } from '@nestjs/testing';
import { RmqContext } from '@nestjs/microservices';
import { InboxMessageProcessor, RmqMessageDeliveryFactory } from '@app/messaging';
import { OrderCreatedConsumer } from './order-created.consumer';
import { OrderCreatedHandler } from '../handlers/order-created.handler';

describe('OrderCreatedConsumer', () => {
  let sut: OrderCreatedConsumer;
  let inboxMessageProcessor: InboxMessageProcessor;
  let rmqMessageDeliveryFactory: RmqMessageDeliveryFactory;
  let orderCreatedHandler: OrderCreatedHandler;

  const message = {
    id: 'event-123',
    orderId: 'order-123',
    userId: 'user-123',
    totalAmount: 100,
    currency: 'USD',
    items: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderCreatedConsumer],
      providers: [
        {
          provide: InboxMessageProcessor,
          useValue: { process: jest.fn() },
        },
        {
          provide: OrderCreatedHandler,
          useValue: {},
        },
        {
          provide: RmqMessageDeliveryFactory,
          useValue: { create: jest.fn() },
        },
      ],
    }).compile();

    sut = module.get<OrderCreatedConsumer>(OrderCreatedConsumer);
    inboxMessageProcessor = module.get<InboxMessageProcessor>(InboxMessageProcessor);
    orderCreatedHandler = module.get<OrderCreatedHandler>(OrderCreatedHandler);
    rmqMessageDeliveryFactory = module.get<RmqMessageDeliveryFactory>(RmqMessageDeliveryFactory);
  });

  it('delegates message processing to the inbox processor', async () => {
    const context = {} as RmqContext;
    const delivery = { ack: jest.fn(), nack: jest.fn() };
    jest.spyOn(rmqMessageDeliveryFactory, 'create').mockReturnValue(delivery);

    await sut.handleOrderCreated(message, context);

    expect(inboxMessageProcessor.process).toHaveBeenCalledWith({
      message,
      handler: orderCreatedHandler,
      delivery,
    });
  });
});
