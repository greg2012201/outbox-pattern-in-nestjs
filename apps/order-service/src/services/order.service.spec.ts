import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Order, OrderItem } from '../entities';
import { OrderService } from './order.service';
import { OrderRepository } from '../repositories/order.repository';
import { CreateOrderDto } from '../dto/create-order.dto';

describe('OrderService', () => {
  let service: OrderService;
  let orderRepository: OrderRepository;
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
        OrderService,
        OrderRepository,
        {
          provide: getRepositoryToken(Order),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            findAndCount: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
    orderRepository = module.get<OrderRepository>(OrderRepository);
    dataSource = module.get<DataSource>(DataSource);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createOrder', () => {
    it('should create a new order with outbox event', async () => {
      const createOrderDto: CreateOrderDto = {
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

      const mockOrder = {
        id: 'order-123',
        ...createOrderDto,
        items: [
          {
            id: 'item-1',
            productId: 'prod-1',
            quantity: 2,
            unitPrice: 50.0,
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(mockQueryRunner.manager, 'create').mockReturnValue(mockOrder as any);
      jest.spyOn(mockQueryRunner.manager, 'save').mockResolvedValue(mockOrder);

      jest.spyOn(orderRepository, 'findByIdWithItems').mockResolvedValue(mockOrder as any);

      const result = await service.createOrder(createOrderDto);

      expect(result).toBeDefined();
      expect(result.userId).toBe(createOrderDto.userId);
      expect(result.totalAmount).toBe(createOrderDto.totalAmount);
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should rollback transaction on error', async () => {
      const createOrderDto: CreateOrderDto = {
        userId: 'user-123',
        totalAmount: 100.0,
        currency: 'USD',
        items: [],
      };

      jest.spyOn(mockQueryRunner.manager, 'create').mockImplementation(() => {
        throw new Error('Creation failed');
      });

      await expect(service.createOrder(createOrderDto)).rejects.toThrow();
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  describe('getOrderById', () => {
    it('should return an order by id', async () => {
      const mockOrder = {
        id: 'order-123',
        userId: 'user-123',
        totalAmount: 100.0,
        currency: 'USD',
        status: 'PENDING',
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(orderRepository, 'findByIdWithItems').mockResolvedValue(mockOrder as any);

      const result = await service.getOrderById('order-123');

      expect(result).toBeDefined();
      expect(result.id).toBe('order-123');
      expect(result.userId).toBe('user-123');
    });

    it('should throw error if order not found', async () => {
      jest.spyOn(orderRepository, 'findByIdWithItems').mockResolvedValue(null as any);

      await expect(service.getOrderById('order-123')).rejects.toThrow();
    });
  });

  describe('getAllOrders', () => {
    it('should return paginated orders', async () => {
      const mockOrders = [
        {
          id: 'order-1',
          userId: 'user-1',
          totalAmount: 100.0,
          currency: 'USD',
          status: 'PENDING',
          items: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      jest
        .spyOn(orderRepository, 'findAllWithPagination')
        .mockResolvedValue({ data: mockOrders as any, total: 1 });

      const result = await service.getAllOrders(0, 10);

      expect(result).toBeDefined();
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });
});
