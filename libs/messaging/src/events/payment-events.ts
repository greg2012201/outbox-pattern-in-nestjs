import { DomainEvent } from './domain-event.interface';

export interface PaymentCompletedEvent extends DomainEvent {
  paymentId: string;
  orderId: string;
  amount: number;
  currency: string;
  transactionId: string;
}

export interface PaymentFailedEvent extends DomainEvent {
  paymentId: string;
  orderId: string;
  reason: string;
}
