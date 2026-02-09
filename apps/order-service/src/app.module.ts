import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ClientsModule } from '@nestjs/microservices';
import { OutboxEvent } from '@app/database';
import { MessagingModule, getRabbitMQConfig } from '@app/messaging';
import { Order, OrderItem } from './entities';
import { OrderController } from './controllers/order.controller';
import { OrderService } from './services/order.service';
import { OrderRepository } from './repositories/order.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, OutboxEvent]),
    ScheduleModule.forRoot(),
    ClientsModule.register([
      {
        name: 'ORDER_SERVICE',
        ...getRabbitMQConfig('order_service_queue'),
      },
    ]),
    MessagingModule.forProducer({
      clientToken: 'ORDER_SERVICE',
      patternTransformer: (eventType) => eventType.toLowerCase().replace(/([A-Z])/g, '.$1'),
    }),
  ],
  controllers: [OrderController],
  providers: [OrderService, OrderRepository],
  exports: [OrderService, OrderRepository],
})
export class OrderServiceModule {}
