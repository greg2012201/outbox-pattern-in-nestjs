import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('idempotency_records')
export class IdempotencyRecord {
  @PrimaryColumn()
  idempotencyKey: string;

  @Column('jsonb', { nullable: true })
  responseBody: Record<string, any> | null;

  @Column({ nullable: true })
  responseStatus: number | null;

  @Column('jsonb', { nullable: true })
  responseHeaders: Record<string, string> | null;

  @Column({ default: false })
  isProcessing: boolean;

  @Index()
  @Column()
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
