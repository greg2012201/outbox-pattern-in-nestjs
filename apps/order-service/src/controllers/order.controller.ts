import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseInterceptors,
} from '@nestjs/common';
import { CreateOrderDto } from '../dto/create-order.dto';
import { OrderDto } from '../dto/order.dto';
import { OrderService } from '../services/order.service';
import { IdempotencyInterceptor } from '../interceptors/idempotency.interceptor';

@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  async createOrder(@Body() createOrderDto: CreateOrderDto): Promise<OrderDto> {
    return this.orderService.createOrder(createOrderDto);
  }

  @Get(':id')
  async getOrder(@Param('id') id: string): Promise<OrderDto> {
    return this.orderService.getOrderById(id);
  }

  @Get()
  async getAllOrders(
    @Query('skip') skip: number = 0,
    @Query('take') take: number = 10
  ): Promise<{ data: OrderDto[]; total: number }> {
    return this.orderService.getAllOrders(skip, take);
  }
}
