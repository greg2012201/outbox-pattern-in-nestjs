import { Injectable, Logger } from '@nestjs/common';
import { Notification, NotificationType, NotificationStatus } from '../entities';
import { NotificationRepository } from '../repositories/notification.repository';
import { NotificationDto } from '../dto/notification.dto';
import { v4 as uuid } from 'uuid';

type SendNotificationParams = {
  orderId: string;
  eventId: string;
  paymentId: string;
  amount: number;
  currency: string;
  transactionId: string;
};

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly notificationRepository: NotificationRepository) {}

  async sendNotification({
    orderId,
    eventId,
    paymentId,
    amount,
    currency,
    transactionId,
  }: SendNotificationParams): Promise<NotificationDto> {
    const existingNotification = await this.notificationRepository.findByEventId(eventId);
    if (existingNotification) {
      this.logger.warn(`Notification already exists for event ${eventId}`);
      return this.mapToDto(existingNotification);
    }

    const notification = await this.notificationRepository.create({
      id: uuid(),
      orderId,
      eventId,
      type: NotificationType.PUSH,
      status: NotificationStatus.PENDING,
    });

    try {
      await this.sendPushNotification({
        orderId,
        paymentId,
        amount,
        currency,
        transactionId,
      });

      const updatedNotification = await this.notificationRepository.update(notification.id, {
        status: NotificationStatus.SENT,
        sentAt: new Date(),
      });

      this.logger.log(`Push notification sent for order ${orderId}`);

      return this.mapToDto(updatedNotification!);
    } catch (error) {
      await this.notificationRepository.update(notification.id, {
        status: NotificationStatus.FAILED,
      });

      this.logger.error(`Failed to send push notification for order ${orderId}:`, error);
      throw error;
    }
  }

  private async sendPushNotification(data: {
    orderId: string;
    paymentId: string;
    amount: number;
    currency: string;
    transactionId: string;
  }) {
    this.logger.log(
      `[MOCK] Sending push notification: Payment of ${data.amount} ${data.currency} completed for order ${data.orderId} (txn: ${data.transactionId})`
    );
  }

  private mapToDto(notification: Notification): NotificationDto {
    return {
      id: notification.id,
      orderId: notification.orderId,
      eventId: notification.eventId,
      type: notification.type,
      status: notification.status,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
      sentAt: notification.sentAt,
    };
  }
}
