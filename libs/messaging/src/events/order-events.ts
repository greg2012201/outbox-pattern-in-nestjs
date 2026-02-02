import { DomainEvent } from './domain-event.interface';

export interface OrderCreatedEvent extends DomainEvent {
  orderId: string;
  userId: string;
  totalAmount: number;
  currency: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
  }>;
}
