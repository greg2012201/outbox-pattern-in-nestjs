export interface DomainEvent {
  id: string;
  businessId: string;
  aggregateId: string;
  eventType: string;
  timestamp: Date;
  data: Record<string, any>;
  version: number;
}
