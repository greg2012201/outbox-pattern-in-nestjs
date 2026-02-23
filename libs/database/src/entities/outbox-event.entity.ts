import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

export enum OutboxEventStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

@Entity('outbox_events')
@Index('idx_outbox_events_status_created', ['status', 'createdAt'])
export class OutboxEvent extends BaseEntity {
  @Column()
  aggregateType: string;

  @Column()
  aggregateId: string;

  @Column()
  eventType: string;

  @Column('jsonb')
  payload: Record<string, any>;

  @Column({
    type: 'varchar',
    default: OutboxEventStatus.PENDING,
  })
  status: OutboxEventStatus;

  @Column({ type: 'uuid', nullable: true })
  processingClaim: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  processingStartedAt: Date | null;

  @Column({ default: 0 })
  retryCount: number;

  @Column({ nullable: true })
  processedAt: Date;
}
