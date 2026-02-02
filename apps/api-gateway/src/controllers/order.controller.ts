import { Controller, Post, Body } from '@nestjs/common';

@Controller('orders')
export class OrderController {
  @Post()
  async createOrder(@Body() body: any) {
    return { message: 'Order created', data: body };
  }
}
