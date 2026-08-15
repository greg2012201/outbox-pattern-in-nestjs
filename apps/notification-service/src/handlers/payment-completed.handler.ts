import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { InboxMessageHandler, PaymentCompletedEvent } from '@app/messaging';
import { NotificationService } from '../services/notification.service';

export type PaymentCompletedMessage = Omit<PaymentCompletedEvent, 'id'> & { id?: string };

type PaymentCompletedWorkParameters = {
  message: PaymentCompletedMessage;
  manager: EntityManager;
};

@Injectable()
export class PaymentCompletedNotificationHandler implements InboxMessageHandler<PaymentCompletedMessage> {
  readonly consumerId = 'notification-service';
  readonly pattern = 'payment.paymentcompleted';

  constructor(private readonly notificationService: NotificationService) {}

  getMessageId(message: PaymentCompletedMessage) {
    return message?.id;
  }

  handle({ message, manager }: PaymentCompletedWorkParameters) {
    return this.notificationService.createPendingNotification({
      manager,
      orderId: message.orderId,
      paymentId: message.paymentId,
      amount: message.amount,
      currency: message.currency,
      transactionId: message.transactionId,
    });
  }
}
