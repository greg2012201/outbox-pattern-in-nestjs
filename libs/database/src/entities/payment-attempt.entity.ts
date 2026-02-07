import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Payment } from './payment.entity';

@Entity('payment_attempts')
export class PaymentAttempt extends BaseEntity {
  @Column()
  paymentId: string;

  @Column()
  attemptNumber: number;

  @Column({ nullable: true })
  errorMessage: string;

  @ManyToOne(() => Payment, { eager: false })
  payment: Payment;
}
