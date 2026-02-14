import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseModule, ProcessedEvent } from '@app/database';
import { MessagingModule } from '@app/messaging';
import { Email } from './entities';
import { EmailService } from './services/email.service';
import { EmailRepository } from './repositories/email.repository';
import { PaymentCompletedConsumer } from './consumers/payment-completed.consumer';

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: '.env.email' }),
    DatabaseModule,
    TypeOrmModule.forFeature([Email, ProcessedEvent]),
    MessagingModule.forConsumer({
      bindings: [{ exchange: 'payment.events', queue: 'email_service_queue' }],
    }),
  ],
  controllers: [PaymentCompletedConsumer],
  providers: [EmailService, EmailRepository],
  exports: [EmailService, EmailRepository],
})
export class EmailServiceModule {}
