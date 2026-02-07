import { Controller, Post, Get, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { CreateOrderDto } from '../dto/create-order.dto';
import { OrderDto } from '../dto/order.dto';
import { OrderService } from '../services/order.service';

@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createOrder(@Body() createOrderDto: CreateOrderDto): Promise<OrderDto> {
    return this.orderService.createOrder(createOrderDto);
  }

  @Get(':id')
  async getOrder(@Param('id') id: string): Promise<OrderDto> {
    return this.orderService.getOrder(id);
  }

  @Get()
  async getAllOrders(
    @Query('skip') skip: number = 0,
    @Query('take') take: number = 10
  ): Promise<{ data: OrderDto[]; total: number }> {
    return this.orderService.getAllOrders(skip, take);
  }
}
