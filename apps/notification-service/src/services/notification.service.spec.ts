import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from 'typeorm';
import { NotificationService } from './notification.service';
import { NotificationRepository } from '../repositories/notification.repository';
import { NotificationStatus, NotificationType } from '../entities';

describe('NotificationService', () => {
  let sut: NotificationService;
  let notificationRepository: NotificationRepository;

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
        NotificationService,
        {
          provide: NotificationRepository,
          useValue: {
            createInTransaction: jest.fn(),
            findById: jest.fn(),
            update: jest.fn(),
          },
        },
      ],
    }).compile();

    sut = module.get<NotificationService>(NotificationService);
    notificationRepository = module.get<NotificationRepository>(NotificationRepository);
  });

  it('should be defined', () => {
    expect(sut).toBeDefined();
  });

  it('creates a pending notification work item without delivering it', async () => {
    const notification = createNotification();
    jest.spyOn(notificationRepository, 'createInTransaction').mockResolvedValue(notification);

    const result = await sut.createPendingNotification(params);

    expect(notificationRepository.createInTransaction).toHaveBeenCalledWith({
      manager,
      data: {
        id: expect.any(String),
        orderId: params.orderId,
        paymentId: params.paymentId,
        amount: params.amount,
        currency: params.currency,
        transactionId: params.transactionId,
        type: NotificationType.PUSH,
        status: NotificationStatus.PENDING,
      },
    });
    expect(result.status).toBe(NotificationStatus.PENDING);
  });

  it('delivers a pending notification separately from work-item creation', async () => {
    const notification = createNotification();
    const sentNotification = createNotification({ status: NotificationStatus.SENT });
    jest.spyOn(notificationRepository, 'findById').mockResolvedValue(notification);
    jest.spyOn(notificationRepository, 'update').mockResolvedValue(sentNotification);

    const result = await sut.deliverNotification(notification.id);

    expect(notificationRepository.update).toHaveBeenCalledWith(notification.id, {
      status: NotificationStatus.SENT,
      sentAt: expect.any(Date),
    });
    expect(result.status).toBe(NotificationStatus.SENT);
  });
});

function createNotification(overrides: Partial<any> = {}) {
  return {
    id: 'notification-123',
    orderId: paramsForTest.orderId,
    paymentId: paramsForTest.paymentId,
    amount: paramsForTest.amount,
    currency: paramsForTest.currency,
    transactionId: paramsForTest.transactionId,
    type: NotificationType.PUSH,
    status: NotificationStatus.PENDING,
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
