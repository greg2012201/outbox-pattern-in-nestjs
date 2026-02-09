import { Column, Entity } from 'typeorm';
import { BaseEntity } from '@app/database';

export enum EmailStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

@Entity('emails')
export class Email extends BaseEntity {
  @Column()
  orderId: string;

  @Column()
  eventId: string;

  @Column()
  recipientEmail: string;

  @Column()
  subject: string;

  @Column({
    type: 'varchar',
    default: EmailStatus.PENDING,
    comment: "Check constraint: status IN ('PENDING', 'SENT', 'FAILED')",
  })
  status: EmailStatus;

  @Column({ nullable: true })
  sentAt: Date;
}
