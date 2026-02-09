import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ClientsModule } from '@nestjs/microservices';
import { OutboxEvent, ProcessedEvent } from '@app/database';
import { MessagingModule, getRabbitMQConfig } from '@app/messaging';
import { Payment, PaymentAttempt } from './entities';
import { PaymentService } from './services/payment.service';
import { PaymentRepository } from './repositories/payment.repository';
import { PaymentAttemptRepository } from './repositories/payment-attempt.repository';
import { OrderCreatedConsumer } from './consumers/order-created.consumer';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, PaymentAttempt, OutboxEvent, ProcessedEvent]),
    ScheduleModule.forRoot(),
    ClientsModule.register([
      {
        name: 'PAYMENT_SERVICE',
        ...getRabbitMQConfig('payment_service_queue'),
      },
    ]),
    MessagingModule.forProducer({
      clientToken: 'PAYMENT_SERVICE',
      patternTransformer: (eventType) => `payment.${eventType.toLowerCase()}`,
    }),
    MessagingModule.forConsumer(),
  ],
  providers: [PaymentService, PaymentRepository, PaymentAttemptRepository, OrderCreatedConsumer],
  exports: [PaymentService, PaymentRepository],
})
export class PaymentServiceModule {}
