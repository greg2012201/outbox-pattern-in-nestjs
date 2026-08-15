import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { InboxMessageHandler, PaymentCompletedEvent } from '@app/messaging';
import { EmailService } from '../services/email.service';

export type PaymentCompletedMessage = Omit<PaymentCompletedEvent, 'id'> & { id?: string };

type PaymentCompletedWorkParameters = {
  message: PaymentCompletedMessage;
  manager: EntityManager;
};

@Injectable()
export class PaymentCompletedEmailHandler implements InboxMessageHandler<PaymentCompletedMessage> {
  readonly consumerId = 'email-service';
  readonly pattern = 'payment.paymentcompleted';

  constructor(private readonly emailService: EmailService) {}

  getMessageId(message: PaymentCompletedMessage) {
    return message?.id;
  }

  handle({ message, manager }: PaymentCompletedWorkParameters) {
    return this.emailService.createPendingEmail({
      manager,
      orderId: message.orderId,
      paymentId: message.paymentId,
      amount: message.amount,
      currency: message.currency,
      transactionId: message.transactionId,
    });
  }
}
