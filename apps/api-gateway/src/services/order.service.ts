import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { CreateOrderDto } from '../dto/create-order.dto';
import { OrderDto } from '../dto/order.dto';

@Injectable()
export class OrderService {
  private readonly orderServiceUrl = process.env.ORDER_SERVICE_URL || 'http://localhost:3001';

  constructor(private readonly httpService: HttpService) {}

  async createOrder(createOrderDto: CreateOrderDto): Promise<OrderDto> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<OrderDto>(`${this.orderServiceUrl}/orders`, createOrderDto)
      );
      return response.data;
    } catch (error) {
      throw new HttpException(
        error.response?.data || 'Failed to create order',
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async getOrder(id: string): Promise<OrderDto> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<OrderDto>(`${this.orderServiceUrl}/orders/${id}`)
      );
      return response.data;
    } catch (error) {
      throw new HttpException(
        error.response?.data || 'Failed to get order',
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async getAllOrders(
    skip: number = 0,
    take: number = 10
  ): Promise<{ data: OrderDto[]; total: number }> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<{ data: OrderDto[]; total: number }>(
          `${this.orderServiceUrl}/orders`,
          {
            params: { skip, take },
          }
        )
      );
      return response.data;
    } catch (error) {
      throw new HttpException(
        error.response?.data || 'Failed to get orders',
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
