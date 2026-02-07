import { Column, Entity, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { OrderItem } from './order-item.entity';

export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

@Entity('orders')
export class Order extends BaseEntity {
  @Column()
  userId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalAmount: number;

  @Column()
  currency: string;

  @Column({
    type: 'varchar',
    default: OrderStatus.PENDING,
    comment: "Check constraint: status IN ('PENDING', 'CONFIRMED', 'PAID', 'CANCELLED')",
  })
  status: OrderStatus;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: OrderItem[];
}
