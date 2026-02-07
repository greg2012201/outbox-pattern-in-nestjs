import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Payment, PaymentAttempt, OutboxEvent, PaymentStatus } from '@app/database/entities';
import { PaymentService } from './payment.service';
import { PaymentRepository } from '../repositories/payment.repository';
import { PaymentAttemptRepository } from '../repositories/payment-attempt.repository';
import { OutboxRepository } from '../repositories/outbox.repository';
import { ProcessedEventRepository } from '../repositories/processed-event.repository';

describe('PaymentService', () => {
  let service: PaymentService;
  let paymentRepository: PaymentRepository;
  let paymentAttemptRepository: PaymentAttemptRepository;
  let processedEventRepository: ProcessedEventRepository;
  let dataSource: DataSource;

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      create: jest.fn(),
      save: jest.fn(),
    },
  };

  const mockDataSource = {
    createQueryRunner: jest.fn(() => mockQueryRunner),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        {
          provide: PaymentRepository,
          useValue: {
            findByOrderId: jest.fn(),
          },
        },
        {
          provide: PaymentAttemptRepository,
          useValue: {
            findByPaymentId: jest.fn(),
          },
        },
        {
          provide: OutboxRepository,
          useValue: {
            findPendingEvents: jest.fn(),
            markAsSent: jest.fn(),
            markAsFailed: jest.fn(),
          },
        },
        {
          provide: ProcessedEventRepository,
          useValue: {
            findProcessedEvent: jest.fn(),
            markAsProcessed: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Payment),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PaymentAttempt),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(OutboxEvent),
          useValue: {
            find: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
    paymentRepository = module.get<PaymentRepository>(PaymentRepository);
    paymentAttemptRepository = module.get<PaymentAttemptRepository>(PaymentAttemptRepository);
    processedEventRepository = module.get<ProcessedEventRepository>(ProcessedEventRepository);
    dataSource = module.get<DataSource>(DataSource);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processPayment', () => {
    it('should process a payment and create outbox event', async () => {
      const orderId = 'order-123';
      const amount = 100.0;
      const currency = 'USD';
      const paymentId = 'payment-123';

      jest.spyOn(paymentRepository, 'findByOrderId').mockResolvedValue(null);

      const mockPayment = {
        id: paymentId,
        orderId,
        amount,
        currency,
        status: PaymentStatus.PROCESSING,
        externalPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockQueryRunner.manager.create.mockReturnValueOnce(mockPayment);
      mockQueryRunner.manager.save.mockResolvedValueOnce(mockPayment);

      const completedPayment = {
        ...mockPayment,
        status: PaymentStatus.COMPLETED,
        externalPaymentId: 'txn_123',
      };

      mockQueryRunner.manager.create.mockReturnValueOnce(completedPayment);
      mockQueryRunner.manager.save.mockResolvedValueOnce(completedPayment);

      const outboxEvent = {
        id: 'event-123',
        aggregateType: 'Payment',
        aggregateId: paymentId,
        eventType: 'PaymentCompleted',
        payload: {
          paymentId,
          orderId,
          amount,
          currency,
          transactionId: 'txn_123',
        },
      };

      mockQueryRunner.manager.create.mockReturnValueOnce(outboxEvent);
      mockQueryRunner.manager.save.mockResolvedValueOnce(outboxEvent);

      const result = await service.processPayment(orderId, amount, currency);

      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(result.status).toBe(PaymentStatus.COMPLETED);
    });

    it('should not process payment if it already exists for the order', async () => {
      const orderId = 'order-123';
      const amount = 100.0;
      const currency = 'USD';

      const existingPayment = {
        id: 'payment-123',
        orderId,
        amount,
        currency,
        status: PaymentStatus.COMPLETED,
        externalPaymentId: 'txn_123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(paymentRepository, 'findByOrderId').mockResolvedValue(existingPayment);

      const result = await service.processPayment(orderId, amount, currency);

      expect(result.id).toBe(existingPayment.id);
      // Should not start transaction if payment already exists
      expect(paymentRepository.findByOrderId).toHaveBeenCalled();
    });

    it('should rollback transaction on error', async () => {
      const orderId = 'order-123';
      const amount = 100.0;
      const currency = 'USD';

      jest.spyOn(paymentRepository, 'findByOrderId').mockResolvedValue(null);

      mockQueryRunner.manager.create.mockImplementation(() => {
        throw new Error('Database error');
      });

      await expect(service.processPayment(orderId, amount, currency)).rejects.toThrow();

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  describe('getPaymentByOrderId', () => {
    it('should retrieve payment by order id', async () => {
      const orderId = 'order-123';
      const mockPayment = {
        id: 'payment-123',
        orderId,
        amount: 100.0,
        currency: 'USD',
        status: PaymentStatus.COMPLETED,
        externalPaymentId: 'txn_123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(paymentRepository, 'findByOrderId').mockResolvedValue(mockPayment);

      const result = await service.getPaymentByOrderId(orderId);

      expect(result).toBeDefined();
      expect(result!.orderId).toBe(orderId);
    });

    it('should return null if payment not found', async () => {
      const orderId = 'order-123';

      jest.spyOn(paymentRepository, 'findByOrderId').mockResolvedValue(null);

      const result = await service.getPaymentByOrderId(orderId);

      expect(result).toBeNull();
    });
  });
});
