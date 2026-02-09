import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from './email.service';
import { EmailRepository } from '../repositories/email.repository';
import { EmailStatus } from '../entities';

describe('EmailService', () => {
  let service: EmailService;
  let emailRepository: EmailRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: EmailRepository,
          useValue: {
            findByEventId: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
    emailRepository = module.get<EmailRepository>(EmailRepository);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendConfirmationEmail', () => {
    const params = {
      orderId: 'order-123',
      eventId: 'event-123',
      paymentId: 'payment-123',
      amount: 100.0,
      currency: 'USD',
      transactionId: 'txn_123',
    };

    it('should create and send a confirmation email', async () => {
      const mockEmail = {
        id: 'email-123',
        orderId: params.orderId,
        eventId: params.eventId,
        recipientEmail: `customer-${params.orderId}@example.com`,
        subject: `Payment Confirmation - Order ${params.orderId} - ${params.amount} ${params.currency}`,
        status: EmailStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        sentAt: null,
      };

      const sentEmail = {
        ...mockEmail,
        status: EmailStatus.SENT,
        sentAt: new Date(),
      };

      jest.spyOn(emailRepository, 'findByEventId').mockResolvedValue(null);
      jest.spyOn(emailRepository, 'create').mockResolvedValue(mockEmail);
      jest.spyOn(emailRepository, 'update').mockResolvedValue(sentEmail);

      const result = await service.sendConfirmationEmail(params);

      expect(emailRepository.findByEventId).toHaveBeenCalledWith(params.eventId);
      expect(emailRepository.create).toHaveBeenCalledWith({
        id: expect.any(String),
        orderId: params.orderId,
        eventId: params.eventId,
        recipientEmail: `customer-${params.orderId}@example.com`,
        subject: `Payment Confirmation - Order ${params.orderId} - ${params.amount} ${params.currency}`,
        status: EmailStatus.PENDING,
      });
      expect(emailRepository.update).toHaveBeenCalledWith(mockEmail.id, {
        status: EmailStatus.SENT,
        sentAt: expect.any(Date),
      });
      expect(result.status).toBe(EmailStatus.SENT);
    });

    it('should return existing email if already processed', async () => {
      const existingEmail = {
        id: 'email-123',
        orderId: params.orderId,
        eventId: params.eventId,
        recipientEmail: `customer-${params.orderId}@example.com`,
        subject: 'Payment Confirmation',
        status: EmailStatus.SENT,
        createdAt: new Date(),
        updatedAt: new Date(),
        sentAt: new Date(),
      };

      jest.spyOn(emailRepository, 'findByEventId').mockResolvedValue(existingEmail);

      const result = await service.sendConfirmationEmail(params);

      expect(result.id).toBe(existingEmail.id);
      expect(emailRepository.create).not.toHaveBeenCalled();
    });
  });
});
