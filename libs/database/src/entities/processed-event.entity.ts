import { Entity, PrimaryColumn } from 'typeorm';
import { CreateDateColumn } from 'typeorm';

@Entity('processed_events')
export class ProcessedEvent {
  @PrimaryColumn()
  eventId: string;

  @PrimaryColumn()
  consumerId: string;

  @CreateDateColumn()
  processedAt: Date;
}
