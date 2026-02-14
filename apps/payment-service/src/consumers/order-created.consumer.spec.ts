import { Test, TestingModule } from '@nestjs/testing';
import { OrderCreatedConsumer } from './order-created.consumer';
import { PaymentService } from '../services/payment.service';
import { ProcessedEventRepository } from '@app/messaging';

describe('OrderCreatedConsumer', () => {
  let consumer: OrderCreatedConsumer;
  let paymentService: PaymentService;
  let processedEventRepository: ProcessedEventRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderCreatedConsumer,
        {
          provide: PaymentService,
          useValue: {
            processPayment: jest.fn(),
          },
        },
        {
          provide: ProcessedEventRepository,
          useValue: {
            findProcessedEvent: jest.fn(),
            markAsProcessed: jest.fn(),
          },
        },
      ],
    }).compile();

    consumer = module.get<OrderCreatedConsumer>(OrderCreatedConsumer);
    paymentService = module.get<PaymentService>(PaymentService);
    processedEventRepository = module.get<ProcessedEventRepository>(ProcessedEventRepository);
  });

  it('should be defined', () => {
    expect(consumer).toBeDefined();
  });

  describe('handleOrderCreated', () => {
    it('should process order created event', async () => {
      const message = {
        id: 'event-123',
        orderId: 'order-123',
        userId: 'user-123',
        totalAmount: 100.0,
        currency: 'USD',
        items: [
          {
            productId: 'prod-1',
            quantity: 2,
            unitPrice: 50.0,
          },
        ],
      };

      jest.spyOn(processedEventRepository, 'findProcessedEvent').mockResolvedValue(null);
      jest.spyOn(paymentService, 'processPayment').mockResolvedValue({
        id: 'payment-123',
        orderId: message.orderId,
        amount: message.totalAmount,
        currency: message.currency,
        status: 'COMPLETED',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      jest.spyOn(processedEventRepository, 'markAsProcessed').mockResolvedValue();

      await consumer.handleOrderCreated(message);

      expect(paymentService.processPayment).toHaveBeenCalledWith(
        message.orderId,
        message.totalAmount,
        message.currency
      );
      expect(processedEventRepository.markAsProcessed).toHaveBeenCalledWith(
        message.id,
        'payment-service'
      );
    });

    it('should handle duplicate events idempotently', async () => {
      const message = {
        id: 'event-123',
        orderId: 'order-123',
        userId: 'user-123',
        totalAmount: 100.0,
        currency: 'USD',
        items: [],
      };

      jest.spyOn(processedEventRepository, 'findProcessedEvent').mockResolvedValue({
        eventId: message.id,
        consumerId: 'payment-service',
        processedAt: new Date(),
      });

      await consumer.handleOrderCreated(message);

      expect(paymentService.processPayment).not.toHaveBeenCalled();
    });

    it('should handle payment service errors gracefully without throwing', async () => {
      const message = {
        id: 'event-123',
        orderId: 'order-123',
        userId: 'user-123',
        totalAmount: 100.0,
        currency: 'USD',
        items: [],
      };

      jest.spyOn(processedEventRepository, 'findProcessedEvent').mockResolvedValue(null);
      jest
        .spyOn(paymentService, 'processPayment')
        .mockRejectedValue(new Error('Payment processing failed'));

      await expect(consumer.handleOrderCreated(message)).resolves.not.toThrow();
      expect(processedEventRepository.markAsProcessed).not.toHaveBeenCalled();
    });
  });
});
