import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcessedEvent } from '@app/database';
import { MessagingModule } from '@app/messaging';
import { Email } from './entities';
import { EmailService } from './services/email.service';
import { EmailRepository } from './repositories/email.repository';
import { PaymentCompletedConsumer } from './consumers/payment-completed.consumer';

@Module({
  imports: [TypeOrmModule.forFeature([Email, ProcessedEvent]), MessagingModule.forConsumer()],
  providers: [EmailService, EmailRepository, PaymentCompletedConsumer],
  exports: [EmailService, EmailRepository],
})
export class EmailServiceModule {}
