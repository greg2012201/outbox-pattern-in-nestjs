import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OutboxEvent } from '@app/database';
import { Order } from '../entities';
import { CreateOrderDto } from '../dto/create-order.dto';
import { OrderDto } from '../dto/order.dto';
import { OrderRepository } from '../repositories/order.repository';
import { v4 as uuid } from 'uuid';

@Injectable()
export class OrderService {
  constructor(
    private readonly orderRepository: OrderRepository,
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    private dataSource: DataSource
  ) {}

  async createOrder(createOrderDto: CreateOrderDto): Promise<OrderDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const order = queryRunner.manager.create(Order, {
        id: uuid(),
        userId: createOrderDto.userId,
        totalAmount: createOrderDto.totalAmount,
        currency: createOrderDto.currency,
        items: createOrderDto.items.map((item) => ({
          id: uuid(),
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      });

      const savedOrder = await queryRunner.manager.save(order);

      const outboxEvent = queryRunner.manager.create(OutboxEvent, {
        id: uuid(),
        aggregateType: 'Order',
        aggregateId: savedOrder.id,
        eventType: 'OrderCreated',
        payload: {
          orderId: savedOrder.id,
          userId: savedOrder.userId,
          totalAmount: savedOrder.totalAmount,
          currency: savedOrder.currency,
          items: savedOrder.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        },
      });

      await queryRunner.manager.save(outboxEvent);

      await queryRunner.commitTransaction();

      const fullOrder = await this.orderRepository.findByIdWithItems(savedOrder.id);
      return this.mapToDto(fullOrder);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getOrderById(id: string): Promise<OrderDto> {
    const order = await this.orderRepository.findByIdWithItems(id);
    if (!order) {
      throw new Error(`Order with id ${id} not found`);
    }
    return this.mapToDto(order);
  }

  async getAllOrders(
    skip: number = 0,
    take: number = 10
  ): Promise<{ data: OrderDto[]; total: number }> {
    const { data, total } = await this.orderRepository.findAllWithPagination(skip, take);
    return {
      data: data.map((order) => this.mapToDto(order)),
      total,
    };
  }

  private mapToDto(order: Order): OrderDto {
    return {
      id: order.id,
      userId: order.userId,
      totalAmount: Number(order.totalAmount),
      currency: order.currency,
      status: order.status,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
      })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }
}
