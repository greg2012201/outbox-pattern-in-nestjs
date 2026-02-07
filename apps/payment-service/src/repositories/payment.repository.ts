import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from '@app/database/entities';
import { BaseRepository } from '@app/database/repositories';

@Injectable()
export class PaymentRepository extends BaseRepository<Payment> {
  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>
  ) {
    super(paymentRepository);
  }

  async findByOrderId(orderId: string): Promise<Payment | null> {
    return this.paymentRepository.findOne({
      where: { orderId },
    });
  }
}
