import { Column, Entity } from 'typeorm';
import { BaseEntity } from '@app/database';

export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('payments')
export class Payment extends BaseEntity {
  @Column()
  orderId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column()
  currency: string;

  @Column({
    type: 'varchar',
    default: PaymentStatus.PENDING,
    comment: "Check constraint: status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')",
  })
  status: PaymentStatus;

  @Column({ nullable: true })
  externalPaymentId: string;
}
