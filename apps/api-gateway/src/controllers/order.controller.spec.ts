import { Test, TestingModule } from '@nestjs/testing';
import { OrderController } from './order.controller';
import { OrderService } from '../services/order.service';
import { CreateOrderDto } from '../dto/create-order.dto';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('API Gateway OrderController', () => {
  let controller: OrderController;
  let service: OrderService;

  const mockOrderService = {
    createOrder: jest.fn(),
    getOrder: jest.fn(),
    getAllOrders: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        {
          provide: OrderService,
          useValue: mockOrderService,
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

      const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';
      const result = await controller.createOrder(createOrderDto, idempotencyKey);

      expect(result).toBeDefined();
      expect(result.id).toBe('order-123');
      expect(mockOrderService.createOrder).toHaveBeenCalledWith({
        createOrderDto,
        idempotencyKey,
      });
    });

    it('should handle service error', async () => {
      const createOrderDto: CreateOrderDto = {
        userId: 'user-123',
        totalAmount: 100.0,
        currency: 'USD',
        items: [],
      };

      mockOrderService.createOrder.mockRejectedValue(
        new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
      );

      await expect(controller.createOrder(createOrderDto, undefined)).rejects.toThrow();
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

      mockOrderService.getOrder.mockResolvedValue(mockOrder);

      const result = await controller.getOrder('order-123');

      expect(result).toBeDefined();
      expect(result.id).toBe('order-123');
      expect(mockOrderService.getOrder).toHaveBeenCalledWith('order-123');
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
