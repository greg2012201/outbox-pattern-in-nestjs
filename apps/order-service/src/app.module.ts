import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { Order, OrderItem, OutboxEvent } from '@app/database/entities';
import { OrderController } from './controllers/order.controller';
import { OrderService } from './services/order.service';
import { OrderRepository } from './repositories/order.repository';
import { OutboxRepository } from './repositories/outbox.repository';
import { OutboxPublisherWorker } from './workers/outbox-publisher.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, OutboxEvent]),
    ScheduleModule.forRoot(),
    ClientsModule.register([
      {
        name: 'ORDER_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URLS || 'amqp://localhost:5672'],
          queue: 'order_service_queue',
          queueOptions: {
            durable: true,
          },
        },
      },
    ]),
  ],
  controllers: [OrderController],
  providers: [OrderService, OrderRepository, OutboxRepository, OutboxPublisherWorker],
  exports: [OrderService, OrderRepository],
})
export class OrderServiceModule {}
