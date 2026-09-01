import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { PaymentAttempt, PaymentStatus } from '../entities';
import { PaymentService } from './payment.service';
import { PaymentRepository } from '../repositories/payment.repository';

describe('PaymentService', () => {
  let service: PaymentService;
  let paymentRepository: PaymentRepository;

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
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
    paymentRepository = module.get<PaymentRepository>(PaymentRepository);

    jest.clearAllMocks();
    mockQueryRunner.manager.create.mockReset();
    mockQueryRunner.manager.save.mockReset();

    jest.spyOn(paymentRepository, 'findByOrderId').mockResolvedValue(null);
    jest.spyOn(service as any, 'callPaymentProvider').mockResolvedValue({
      success: true,
      transactionId: 'txn_123',
    });
  });

  describe('processPayment', () => {
    it('should process a payment and create outbox event atomically', async () => {
      const orderId = 'order-123';
      const amount = 100.0;
      const currency = 'USD';
      const paymentId = 'payment-123';

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

      const result = await service.processPayment({ orderId, amount, currency });

      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
      expect(result.status).toBe(PaymentStatus.COMPLETED);
    });

    it('should commit the transaction when a payment already exists', async () => {
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
      const result = await service.processPayment({
        orderId,
        amount,
        currency,
      });

      expect(result.id).toBe(existingPayment.id);
      expect(paymentRepository.findByOrderId).toHaveBeenCalledWith({
        orderId,
        manager: mockQueryRunner.manager as any,
      });
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
      expect((service as any).callPaymentProvider).not.toHaveBeenCalled();
    });

    it('should create a failed payment and retry attempt from the provider result', async () => {
      const orderId = 'order-123';
      const amount = 100.0;
      const currency = 'USD';
      const paymentId = 'payment-123';
      const payment = {
        id: paymentId,
        orderId,
        amount,
        currency,
        status: PaymentStatus.PROCESSING,
        externalPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const failedPayment = { ...payment, status: PaymentStatus.FAILED };
      const outboxEvent = { id: 'event-123' };
      const attempt = { id: 'attempt-123' };

      jest.spyOn(service as any, 'callPaymentProvider').mockResolvedValue({
        success: false,
        error: 'Provider declined payment',
      });
      mockQueryRunner.manager.create
        .mockReturnValueOnce(payment)
        .mockReturnValueOnce(failedPayment)
        .mockReturnValueOnce(outboxEvent)
        .mockReturnValueOnce(attempt);
      mockQueryRunner.manager.save
        .mockResolvedValueOnce(payment)
        .mockResolvedValueOnce(failedPayment)
        .mockResolvedValueOnce(outboxEvent)
        .mockResolvedValueOnce(attempt);

      const result = await service.processPayment({ orderId, amount, currency });

      expect(result.status).toBe(PaymentStatus.FAILED);
      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(PaymentAttempt, {
        id: expect.any(String),
        paymentId,
        attemptNumber: 1,
        errorMessage: 'Provider declined payment',
      });
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should roll back the transaction on error', async () => {
      const orderId = 'order-123';
      const amount = 100.0;
      const currency = 'USD';

      mockQueryRunner.manager.create.mockImplementation(() => {
        throw new Error('Database error');
      });

      await expect(service.processPayment({ orderId, amount, currency })).rejects.toThrow();

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should process a payment with the supplied transaction manager', async () => {
      const orderId = 'order-123';
      const amount = 100.0;
      const currency = 'USD';
      const payment = {
        id: 'payment-123',
        orderId,
        amount,
        currency,
        status: PaymentStatus.PROCESSING,
        externalPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const completedPayment = {
        ...payment,
        status: PaymentStatus.COMPLETED,
        externalPaymentId: 'txn_123',
      };

      mockQueryRunner.manager.create
        .mockReturnValueOnce(payment)
        .mockReturnValueOnce(completedPayment)
        .mockReturnValueOnce({ id: 'event-123' });
      mockQueryRunner.manager.save
        .mockResolvedValueOnce(payment)
        .mockResolvedValueOnce(completedPayment)
        .mockResolvedValueOnce({ id: 'event-123' });

      const result = await service.processPaymentInTransaction({
        manager: mockQueryRunner.manager as any,
        orderId,
        amount,
        currency,
      });

      expect(result.status).toBe(PaymentStatus.COMPLETED);
      expect(paymentRepository.findByOrderId).toHaveBeenCalledWith({
        orderId,
        manager: mockQueryRunner.manager,
      });
      expect(mockQueryRunner.startTransaction).not.toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
    });
  });

  describe('getPaymentByOrderId', () => {
    it('should retrieve a payment by order id', async () => {
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
      expect(paymentRepository.findByOrderId).toHaveBeenCalledWith({ orderId });
    });

    it('should return null if a payment is not found', async () => {
      const orderId = 'order-123';

      jest.spyOn(paymentRepository, 'findByOrderId').mockResolvedValue(null);

      const result = await service.getPaymentByOrderId(orderId);

      expect(result).toBeNull();
    });
  });
});
