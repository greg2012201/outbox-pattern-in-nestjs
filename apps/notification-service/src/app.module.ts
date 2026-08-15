import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseModule } from '@app/database';
import { MessagingModule } from '@app/messaging';
import { Notification } from './entities';
import { NotificationService } from './services/notification.service';
import { NotificationRepository } from './repositories/notification.repository';
import { PaymentCompletedConsumer } from './consumers/payment-completed.consumer';
import { PaymentCompletedNotificationHandler } from './handlers/payment-completed.handler';

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: '.env.notification' }),
    DatabaseModule,
    TypeOrmModule.forFeature([Notification]),
    MessagingModule.forConsumer({
      bindings: [{ exchange: 'payment.events', queue: 'notification_service_queue' }],
    }),
  ],
  controllers: [PaymentCompletedConsumer],
  providers: [NotificationService, NotificationRepository, PaymentCompletedNotificationHandler],
  exports: [NotificationService, NotificationRepository],
})
export class NotificationServiceModule {}
