import { Test, TestingModule } from '@nestjs/testing';
import { PaymentCompletedConsumer } from './payment-completed.consumer';
import { EmailService } from '../services/email.service';
import { ProcessedEventRepository } from '@app/messaging';

describe('PaymentCompletedConsumer', () => {
  let consumer: PaymentCompletedConsumer;
  let emailService: EmailService;
  let processedEventRepository: ProcessedEventRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentCompletedConsumer,
        {
          provide: EmailService,
          useValue: {
            sendConfirmationEmail: jest.fn(),
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
    emailService = module.get<EmailService>(EmailService);
    processedEventRepository = module.get<ProcessedEventRepository>(ProcessedEventRepository);
  });

  it('should be defined', () => {
    expect(consumer).toBeDefined();
  });

  describe('handlePaymentCompleted', () => {
    const message = {
      id: 'event-123',
      aggregateId: 'order-123',
      eventType: 'payment.completed',
      timestamp: new Date(),
      data: {},
      version: 1,
      paymentId: 'payment-123',
      orderId: 'order-123',
      amount: 100.0,
      currency: 'USD',
      transactionId: 'txn_123',
    };

    it('should process payment completed event and send email', async () => {
      jest.spyOn(processedEventRepository, 'findProcessedEvent').mockResolvedValue(null);
      jest.spyOn(emailService, 'sendConfirmationEmail').mockResolvedValue({
        id: 'email-123',
        orderId: message.orderId,
        eventId: message.id,
        recipientEmail: 'customer@example.com',
        subject: 'Payment Confirmation',
        status: 'SENT',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      jest.spyOn(processedEventRepository, 'markAsProcessed').mockResolvedValue();

      await consumer.handlePaymentCompleted(message);

      expect(emailService.sendConfirmationEmail).toHaveBeenCalledWith({
        orderId: message.orderId,
        eventId: message.id,
        paymentId: message.paymentId,
        amount: message.amount,
        currency: message.currency,
        transactionId: message.transactionId,
      });
      expect(processedEventRepository.markAsProcessed).toHaveBeenCalledWith(
        message.id,
        'email-service'
      );
    });

    it('should handle duplicate events idempotently', async () => {
      jest.spyOn(processedEventRepository, 'findProcessedEvent').mockResolvedValue({
        eventId: message.id,
        consumerId: 'email-service',
        processedAt: new Date(),
      });

      await consumer.handlePaymentCompleted(message);

      expect(emailService.sendConfirmationEmail).not.toHaveBeenCalled();
    });

    it('should handle email service errors gracefully', async () => {
      jest.spyOn(processedEventRepository, 'findProcessedEvent').mockResolvedValue(null);
      jest
        .spyOn(emailService, 'sendConfirmationEmail')
        .mockRejectedValue(new Error('Email sending failed'));

      await expect(consumer.handlePaymentCompleted(message)).rejects.toThrow();
    });
  });
});
