import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from './base.entity';

export enum InboxMessageStatus {
  PROCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
}

@Entity('inbox_messages')
@Unique('uq_inbox_messages_message_consumer', ['messageId', 'consumerId'])
@Index('idx_inbox_messages_status_lease', ['status', 'leaseExpiresAt'])
export class InboxMessage extends BaseEntity {
  @Column()
  messageId: string;

  @Column()
  consumerId: string;

  @Column()
  pattern: string;

  @Column('jsonb')
  payload: Record<string, any>;

  @Column({
    type: 'varchar',
    default: InboxMessageStatus.PROCESSING,
  })
  status: InboxMessageStatus;

  @Column({ default: 0 })
  attemptCount: number;

  @Column({ type: 'timestamptz' })
  receivedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  processingStartedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  leaseExpiresAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  claimToken: string | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;
}
