import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcessedEvent } from '@app/database';
import { MessagingModule } from '@app/messaging';
import { Notification } from './entities';
import { NotificationService } from './services/notification.service';
import { NotificationRepository } from './repositories/notification.repository';
import { PaymentCompletedConsumer } from './consumers/payment-completed.consumer';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, ProcessedEvent]),
    MessagingModule.forConsumer(),
  ],
  providers: [NotificationService, NotificationRepository, PaymentCompletedConsumer],
  exports: [NotificationService, NotificationRepository],
})
export class NotificationServiceModule {}
