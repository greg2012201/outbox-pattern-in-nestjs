import { Test, TestingModule } from '@nestjs/testing';
import { NotificationService } from './notification.service';
import { NotificationRepository } from '../repositories/notification.repository';
import { NotificationStatus, NotificationType } from '../entities';

type MockNotificationRepository = Pick<NotificationRepository, 'findByEventId'> & {
  create: jest.Mock;
  update: jest.Mock;
};

describe('NotificationService', () => {
  let service: NotificationService;
  let notificationRepository: MockNotificationRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: NotificationRepository,
          useValue: {
            findByEventId: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
    notificationRepository = module.get<NotificationRepository>(
      NotificationRepository
    ) as unknown as MockNotificationRepository;

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendNotification', () => {
    const params = {
      orderId: 'order-123',
      eventId: 'event-123',
      paymentId: 'payment-123',
      amount: 100.0,
      currency: 'USD',
      transactionId: 'txn_123',
    };

    it('should create and send a push notification', async () => {
      const mockNotification = {
        id: 'notification-123',
        orderId: params.orderId,
        eventId: params.eventId,
        type: NotificationType.PUSH,
        status: NotificationStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        sentAt: null,
      };

      const sentNotification = {
        ...mockNotification,
        status: NotificationStatus.SENT,
        sentAt: new Date(),
      };

      jest.spyOn(notificationRepository, 'findByEventId').mockResolvedValue(null);
      notificationRepository.create.mockResolvedValue(mockNotification);
      notificationRepository.update.mockResolvedValue(sentNotification);

      const result = await service.sendNotification(params);

      expect(notificationRepository.findByEventId).toHaveBeenCalledWith(params.eventId);
      expect(notificationRepository.create).toHaveBeenCalledWith({
        id: expect.any(String),
        orderId: params.orderId,
        eventId: params.eventId,
        type: NotificationType.PUSH,
        status: NotificationStatus.PENDING,
      });
      expect(notificationRepository.update).toHaveBeenCalledWith(mockNotification.id, {
        status: NotificationStatus.SENT,
        sentAt: expect.any(Date),
      });
      expect(result.status).toBe(NotificationStatus.SENT);
    });

    it('should return existing notification if already processed', async () => {
      const existingNotification = {
        id: 'notification-123',
        orderId: params.orderId,
        eventId: params.eventId,
        type: NotificationType.PUSH,
        status: NotificationStatus.SENT,
        createdAt: new Date(),
        updatedAt: new Date(),
        sentAt: new Date(),
      };

      jest.spyOn(notificationRepository, 'findByEventId').mockResolvedValue(existingNotification);

      const result = await service.sendNotification(params);

      expect(result.id).toBe(existingNotification.id);
      expect(notificationRepository.create).not.toHaveBeenCalled();
    });
  });
});
