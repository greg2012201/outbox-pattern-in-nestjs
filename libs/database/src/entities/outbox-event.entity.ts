import { Column, Entity } from 'typeorm';
import { BaseEntity } from './base.entity';

export enum OutboxEventStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

@Entity('outbox_events')
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
    comment: "Check constraint: status IN ('PENDING', 'SENT', 'FAILED')",
  })
  status: OutboxEventStatus;

  @Column({ default: 0 })
  retryCount: number;

  @Column({ nullable: true })
  processedAt: Date;
}
