import { DomainEvent } from './domain-event.interface';

export interface NotificationEvent extends DomainEvent {
  orderId: string;
  userId: string;
  type: string;
}
