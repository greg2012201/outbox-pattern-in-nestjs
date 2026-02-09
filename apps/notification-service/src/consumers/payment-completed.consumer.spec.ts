import { Test, TestingModule } from '@nestjs/testing';
import { PaymentCompletedConsumer } from './payment-completed.consumer';
import { NotificationService } from '../services/notification.service';
import { ProcessedEventRepository } from '@app/messaging';

describe('PaymentCompletedConsumer', () => {
  let consumer: PaymentCompletedConsumer;
  let notificationService: NotificationService;
  let processedEventRepository: ProcessedEventRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentCompletedConsumer,
        {
          provide: NotificationService,
          useValue: {
            sendNotification: jest.fn(),
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

    consumer = module.get<PaymentCompletedConsumer>(PaymentCompletedConsumer);
    notificationService = module.get<NotificationService>(NotificationService);
    processedEventRepository = module.get<ProcessedEventRepository>(ProcessedEventRepository);
  });

  it('should be defined', () => {
    expect(consumer).toBeDefined();
  });

  describe('handlePaymentCompleted', () => {
    const message = {
      id: 'event-123',
      paymentId: 'payment-123',
      orderId: 'order-123',
      amount: 100.0,
      currency: 'USD',
      transactionId: 'txn_123',
    };

    it('should process payment completed event', async () => {
      jest.spyOn(processedEventRepository, 'findProcessedEvent').mockResolvedValue(null);
      jest.spyOn(notificationService, 'sendNotification').mockResolvedValue({
        id: 'notification-123',
        orderId: message.orderId,
        eventId: message.id,
        type: 'PUSH',
        status: 'SENT',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      jest.spyOn(processedEventRepository, 'markAsProcessed').mockResolvedValue();

      await consumer.handlePaymentCompleted(message);

      expect(notificationService.sendNotification).toHaveBeenCalledWith({
        orderId: message.orderId,
        eventId: message.id,
        paymentId: message.paymentId,
        amount: message.amount,
        currency: message.currency,
        transactionId: message.transactionId,
      });
      expect(processedEventRepository.markAsProcessed).toHaveBeenCalledWith(
        message.id,
        'notification-service'
      );
    });

    it('should handle duplicate events idempotently', async () => {
      jest.spyOn(processedEventRepository, 'findProcessedEvent').mockResolvedValue({
        eventId: message.id,
        consumerId: 'notification-service',
        processedAt: new Date(),
      });

      await consumer.handlePaymentCompleted(message);

      expect(notificationService.sendNotification).not.toHaveBeenCalled();
    });

    it('should handle notification service errors gracefully', async () => {
      jest.spyOn(processedEventRepository, 'findProcessedEvent').mockResolvedValue(null);
      jest
        .spyOn(notificationService, 'sendNotification')
        .mockRejectedValue(new Error('Notification sending failed'));

      await expect(consumer.handlePaymentCompleted(message)).rejects.toThrow();
    });
  });
});
