import { DomainEvent } from './domain-event.interface';

export interface AccountingEvent extends DomainEvent {
  orderId: string;
  paymentId: string;
  amount: number;
  currency: string;
}
