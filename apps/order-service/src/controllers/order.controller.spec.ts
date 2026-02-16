import { Test, TestingModule } from '@nestjs/testing';
import { OrderController } from './order.controller';
import { OrderService } from '../services/order.service';
import { IdempotencyService } from '../services/idempotency.service';
import { CreateOrderDto } from '../dto/create-order.dto';

describe('OrderController', () => {
  let controller: OrderController;
  let service: OrderService;

  const mockOrderService = {
    createOrder: jest.fn(),
    getOrderById: jest.fn(),
    getAllOrders: jest.fn(),
  };

  const mockIdempotencyService = {
    acquireLock: jest.fn(),
    complete: jest.fn(),
    unlock: jest.fn(),
    cleanupExpired: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        {
          provide: OrderService,
          useValue: mockOrderService,
        },
        {
          provide: IdempotencyService,
          useValue: mockIdempotencyService,
        },
      ],
    }).compile();

    controller = module.get<OrderController>(OrderController);
    service = module.get<OrderService>(OrderService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createOrder', () => {
    it('should create and return an order', async () => {
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
            ...createOrderDto.items[0],
          },
        ],
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockOrderService.createOrder.mockResolvedValue(mockOrder);

      const result = await controller.createOrder(createOrderDto);

      expect(result).toBeDefined();
      expect(result.id).toBe('order-123');
      expect(mockOrderService.createOrder).toHaveBeenCalledWith(createOrderDto);
    });
  });

  describe('getOrder', () => {
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

      mockOrderService.getOrderById.mockResolvedValue(mockOrder);

      const result = await controller.getOrder('order-123');

      expect(result).toBeDefined();
      expect(result.id).toBe('order-123');
      expect(mockOrderService.getOrderById).toHaveBeenCalledWith('order-123');
    });
  });

  describe('getAllOrders', () => {
    it('should return paginated orders', async () => {
      const mockResponse = {
        data: [
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
        ],
        total: 1,
      };

      mockOrderService.getAllOrders.mockResolvedValue(mockResponse);

      const result = await controller.getAllOrders(0, 10);

      expect(result).toBeDefined();
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockOrderService.getAllOrders).toHaveBeenCalledWith(0, 10);
    });
  });
});
