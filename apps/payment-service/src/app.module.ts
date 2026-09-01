import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule, OutboxEvent } from '@app/database';
import { MessagingModule } from '@app/messaging';
import { Payment, PaymentAttempt } from './entities';
import { PaymentService } from './services/payment.service';
import { PaymentRepository } from './repositories/payment.repository';
import { OrderCreatedConsumer } from './consumers/order-created.consumer';
import { OrderCreatedHandler } from './handlers/order-created.handler';

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: '.env.payment' }),
    DatabaseModule,
    TypeOrmModule.forFeature([Payment, PaymentAttempt, OutboxEvent]),
    ScheduleModule.forRoot(),
    MessagingModule.forFanoutProducer({
      exchange: 'payment.events',
      patternTransformer: (eventType) => `payment.${eventType.toLowerCase()}`,
    }),
    MessagingModule.forConsumer({
      bindings: [{ queue: 'payment_service_queue' }],
    }),
  ],
  controllers: [OrderCreatedConsumer],
  providers: [PaymentService, PaymentRepository, OrderCreatedHandler],
  exports: [PaymentService, PaymentRepository],
})
export class PaymentServiceModule {}
