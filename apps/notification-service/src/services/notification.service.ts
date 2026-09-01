import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Notification, NotificationType, NotificationStatus } from '../entities';
import { NotificationRepository } from '../repositories/notification.repository';
import { NotificationDto } from '../dto/notification.dto';
import { v4 as uuid } from 'uuid';

type NotificationWorkItemParams = {
  manager: EntityManager;
  orderId: string;
  paymentId: string;
  amount: number;
  currency: string;
  transactionId: string;
};

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly notificationRepository: NotificationRepository) {}

  async createPendingNotification({
    manager,
    orderId,
    paymentId,
    amount,
    currency,
    transactionId,
  }: NotificationWorkItemParams) {
    const notification = await this.notificationRepository.createNotification({
      manager,
      data: {
        id: uuid(),
        orderId,
        paymentId,
        amount,
        currency,
        transactionId,
        type: NotificationType.PUSH,
        status: NotificationStatus.PENDING,
      },
    });

    return this.mapToDto(notification);
  }

  async deliverNotification(notificationId: string) {
    const notification = await this.notificationRepository.findById(notificationId);
    if (!notification) {
      throw new Error(`Notification ${notificationId} not found`);
    }

    if (notification.status === NotificationStatus.SENT) {
      return this.mapToDto(notification);
    }

    try {
      await this.sendPushNotification({
        orderId: notification.orderId,
        paymentId: notification.paymentId,
        amount: notification.amount,
        currency: notification.currency,
        transactionId: notification.transactionId,
      });

      const updatedNotification = await this.notificationRepository.update(notification.id, {
        status: NotificationStatus.SENT,
        sentAt: new Date(),
      });

      this.logger.log(`Push notification sent for order ${notification.orderId}`);

      return this.mapToDto(updatedNotification!);
    } catch (error) {
      await this.notificationRepository.update(notification.id, {
        status: NotificationStatus.FAILED,
      });

      this.logger.error(
        `Failed to send push notification for order ${notification.orderId}:`,
        error
      );
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
      type: notification.type,
      status: notification.status,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
      sentAt: notification.sentAt,
    };
  }
}
