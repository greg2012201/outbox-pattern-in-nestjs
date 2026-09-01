import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from 'typeorm';
import { EmailService } from './email.service';
import { EmailRepository } from '../repositories/email.repository';
import { EmailStatus } from '../entities';

describe('EmailService', () => {
  let sut: EmailService;
  let emailRepository: EmailRepository;

  const manager = {} as EntityManager;
  const params = {
    manager,
    orderId: 'order-123',
    paymentId: 'payment-123',
    amount: 100,
    currency: 'USD',
    transactionId: 'txn_123',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: EmailRepository,
          useValue: {
            saveEmail: jest.fn(),
            findById: jest.fn(),
            update: jest.fn(),
          },
        },
      ],
    }).compile();

    sut = module.get<EmailService>(EmailService);
    emailRepository = module.get<EmailRepository>(EmailRepository);
  });

  it('should be defined', () => {
    expect(sut).toBeDefined();
  });

  it('creates a pending email work item without delivering it', async () => {
    const email = createEmail();
    jest.spyOn(emailRepository, 'saveEmail').mockResolvedValue(email);

    const result = await sut.createPendingEmail(params);

    expect(emailRepository.saveEmail).toHaveBeenCalledWith({
      manager,
      data: {
        id: expect.any(String),
        orderId: params.orderId,
        paymentId: params.paymentId,
        amount: params.amount,
        currency: params.currency,
        transactionId: params.transactionId,
        recipientEmail: `customer-${params.orderId}@example.com`,
        subject: `Payment Confirmation - Order ${params.orderId} - ${params.amount} ${params.currency}`,
        status: EmailStatus.PENDING,
      },
    });
    expect(result.status).toBe(EmailStatus.PENDING);
  });

  it('delivers a pending email separately from work-item creation', async () => {
    const email = createEmail();
    const sentEmail = createEmail({ status: EmailStatus.SENT });
    jest.spyOn(emailRepository, 'findById').mockResolvedValue(email);
    jest.spyOn(emailRepository, 'update').mockResolvedValue(sentEmail);

    const result = await sut.deliverEmail(email.id);

    expect(emailRepository.update).toHaveBeenCalledWith(email.id, {
      status: EmailStatus.SENT,
      sentAt: expect.any(Date),
    });
    expect(result.status).toBe(EmailStatus.SENT);
  });

  it('returns a sent email without sending it again', async () => {
    const email = createEmail({ status: EmailStatus.SENT });
    jest.spyOn(emailRepository, 'findById').mockResolvedValue(email);
    const sendEmail = jest.fn();
    (sut as unknown as EmailServicePrivateApi).sendEmail = sendEmail;

    const result = await sut.deliverEmail(email.id);

    expect(sendEmail).not.toHaveBeenCalled();
    expect(emailRepository.update).not.toHaveBeenCalled();
    expect(result.status).toBe(EmailStatus.SENT);
  });

  it('marks an email as failed when sending fails', async () => {
    const email = createEmail();
    const error = new Error('smtp unavailable');
    jest.spyOn(emailRepository, 'findById').mockResolvedValue(email);
    (sut as unknown as EmailServicePrivateApi).sendEmail = jest.fn().mockRejectedValue(error);

    await expect(sut.deliverEmail(email.id)).rejects.toThrow(error);

    expect(emailRepository.update).toHaveBeenCalledWith(email.id, {
      status: EmailStatus.FAILED,
    });
  });

  it('throws when the email does not exist', async () => {
    jest.spyOn(emailRepository, 'findById').mockResolvedValue(null);

    await expect(sut.deliverEmail('missing-email')).rejects.toThrow(
      'Email missing-email not found'
    );
    expect(emailRepository.update).not.toHaveBeenCalled();
  });
});

function createEmail(overrides: Partial<any> = {}) {
  return {
    id: 'email-123',
    orderId: paramsForTest.orderId,
    paymentId: paramsForTest.paymentId,
    amount: paramsForTest.amount,
    currency: paramsForTest.currency,
    transactionId: paramsForTest.transactionId,
    recipientEmail: `customer-${paramsForTest.orderId}@example.com`,
    subject: `Payment Confirmation - Order ${paramsForTest.orderId} - ${paramsForTest.amount} ${paramsForTest.currency}`,
    status: EmailStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
    sentAt: null,
    ...overrides,
  };
}

const paramsForTest = {
  orderId: 'order-123',
  paymentId: 'payment-123',
  amount: 100,
  currency: 'USD',
  transactionId: 'txn_123',
};

type EmailServicePrivateApi = {
  sendEmail: jest.Mock;
};
