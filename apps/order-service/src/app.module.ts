import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule, OutboxEvent, IdempotencyRecord } from '@app/database';
import { MessagingModule } from '@app/messaging';
import { Order, OrderItem } from './entities';
import { OrderController } from './controllers/order.controller';
import { OrderService } from './services/order.service';
import { OrderRepository } from './repositories/order.repository';
import { IdempotencyService } from './services/idempotency.service';
import { IdempotencyInterceptor } from './interceptors/idempotency.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: '.env.order' }),
    DatabaseModule,
    TypeOrmModule.forFeature([Order, OrderItem, OutboxEvent, IdempotencyRecord]),
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
  providers: [OrderService, OrderRepository, IdempotencyService, IdempotencyInterceptor],
  exports: [OrderService, OrderRepository],
})
export class OrderServiceModule {}
