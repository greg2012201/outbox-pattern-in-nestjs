import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule, OutboxEvent, ProcessedEvent } from '@app/database';
import { MessagingModule } from '@app/messaging';
import { Payment, PaymentAttempt } from './entities';
import { PaymentService } from './services/payment.service';
import { PaymentRepository } from './repositories/payment.repository';
import { PaymentAttemptRepository } from './repositories/payment-attempt.repository';
import { OrderCreatedConsumer } from './consumers/order-created.consumer';

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: '.env.payment' }),
    DatabaseModule,
    TypeOrmModule.forFeature([Payment, PaymentAttempt, OutboxEvent, ProcessedEvent]),
    ScheduleModule.forRoot(),
    MessagingModule.forProducer({
      clientToken: 'PAYMENT_SERVICE',
      queue: 'payment_service_queue',
      patternTransformer: (eventType) => `payment.${eventType.toLowerCase()}`,
    }),
    MessagingModule.forConsumer(),
  ],
  providers: [PaymentService, PaymentRepository, PaymentAttemptRepository, OrderCreatedConsumer],
  exports: [PaymentService, PaymentRepository],
})
export class PaymentServiceModule {}
