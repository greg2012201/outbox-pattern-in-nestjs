import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule, OutboxEvent } from '@app/database';
import { MessagingModule } from '@app/messaging';
import { Order, OrderItem } from './entities';
import { OrderController } from './controllers/order.controller';
import { OrderService } from './services/order.service';
import { OrderRepository } from './repositories/order.repository';

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: '.env.order' }),
    DatabaseModule,
    TypeOrmModule.forFeature([Order, OrderItem, OutboxEvent]),
    ScheduleModule.forRoot(),
    MessagingModule.forDirectProducer({
      clientToken: 'ORDER_SERVICE',
      queue: 'payment_service_queue',
      patternTransformer: (eventType) =>
        eventType
          .replace(/([A-Z])/g, '.$1')
          .toLowerCase()
          .slice(1),
    }),
  ],
  controllers: [OrderController],
  providers: [OrderService, OrderRepository],
  exports: [OrderService, OrderRepository],
})
export class OrderServiceModule {}
