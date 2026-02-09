import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification, ProcessedEvent } from '@app/database/entities';
import { NotificationService } from './services/notification.service';
import { NotificationRepository } from './repositories/notification.repository';
import { ProcessedEventRepository } from './repositories/processed-event.repository';
import { PaymentCompletedConsumer } from './consumers/payment-completed.consumer';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, ProcessedEvent])],
  providers: [
    NotificationService,
    NotificationRepository,
    ProcessedEventRepository,
    PaymentCompletedConsumer,
  ],
  exports: [NotificationService, NotificationRepository],
})
export class NotificationServiceModule {}
