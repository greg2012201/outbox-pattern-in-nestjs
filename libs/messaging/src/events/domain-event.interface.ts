export interface DomainEvent {
  id: string;
  aggregateId: string;
  eventType: string;
  timestamp: Date;
  data: Record<string, any>;
  version: number;
}
