import { Column, Entity } from 'typeorm';
import { BaseEntity } from '@app/database';

export enum NotificationType {
  SMS = 'SMS',
  PUSH = 'PUSH',
  EMAIL = 'EMAIL',
}

export enum NotificationStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

@Entity('notifications')
export class Notification extends BaseEntity {
  @Column()
  orderId: string;

  @Column()
  eventId: string;

  @Column({
    type: 'varchar',
    default: NotificationType.PUSH,
    comment: "Check constraint: type IN ('SMS', 'PUSH', 'EMAIL')",
  })
  type: NotificationType;

  @Column({
    type: 'varchar',
    default: NotificationStatus.PENDING,
    comment: "Check constraint: status IN ('PENDING', 'SENT', 'FAILED')",
  })
  status: NotificationStatus;

  @Column({ nullable: true })
  sentAt: Date;
}
