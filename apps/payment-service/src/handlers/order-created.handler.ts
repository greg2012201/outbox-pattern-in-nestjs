import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { InboxMessageHandler } from '@app/messaging';
import { PaymentService } from '../services/payment.service';

export type OrderCreatedMessage = {
  id: string;
  businessId: string;
  orderId: string;
  userId: string;
  totalAmount: number;
  currency: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
  }>;
};

type OrderCreatedWorkParameters = {
  message: OrderCreatedMessage;
  manager: EntityManager;
};

@Injectable()
export class OrderCreatedHandler implements InboxMessageHandler<OrderCreatedMessage> {
  readonly consumerId = 'payment-service';
  readonly pattern = 'order.created';

  constructor(private readonly paymentService: PaymentService) {}

  getMessageId(message: OrderCreatedMessage) {
    return message?.id;
  }

  getBusinessId(message: OrderCreatedMessage) {
    return message?.businessId;
  }

  handle({ message, manager }: OrderCreatedWorkParameters) {
    return this.paymentService.processPaymentInTransaction({
      manager,
      orderId: message.orderId,
      amount: message.totalAmount,
      currency: message.currency,
    });
  }
}
