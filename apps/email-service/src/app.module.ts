import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Email, ProcessedEvent } from '@app/database/entities';
import { EmailService } from './services/email.service';
import { EmailRepository } from './repositories/email.repository';
import { ProcessedEventRepository } from './repositories/processed-event.repository';
import { PaymentCompletedConsumer } from './consumers/payment-completed.consumer';

@Module({
  imports: [TypeOrmModule.forFeature([Email, ProcessedEvent])],
  providers: [EmailService, EmailRepository, ProcessedEventRepository, PaymentCompletedConsumer],
  exports: [EmailService, EmailRepository],
})
export class EmailServiceModule {}
