import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { Payment, PaymentAttempt, OutboxEvent, ProcessedEvent } from '@app/database/entities';
import { PaymentService } from './services/payment.service';
import { PaymentRepository } from './repositories/payment.repository';
import { PaymentAttemptRepository } from './repositories/payment-attempt.repository';
import { OutboxRepository } from './repositories/outbox.repository';
import { ProcessedEventRepository } from './repositories/processed-event.repository';
import { OrderCreatedConsumer } from './consumers/order-created.consumer';
import { OutboxPublisherWorker } from './workers/outbox-publisher.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, PaymentAttempt, OutboxEvent, ProcessedEvent]),
    ScheduleModule.forRoot(),
    ClientsModule.register([
      {
        name: 'PAYMENT_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URLS || 'amqp://localhost:5672'],
          queue: 'payment_service_queue',
          queueOptions: {
            durable: true,
          },
        },
      },
    ]),
  ],
  providers: [
    PaymentService,
    PaymentRepository,
    PaymentAttemptRepository,
    OutboxRepository,
    ProcessedEventRepository,
    OrderCreatedConsumer,
    OutboxPublisherWorker,
  ],
  exports: [PaymentService, PaymentRepository],
})
export class PaymentServiceModule {}
