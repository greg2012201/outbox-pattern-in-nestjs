import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentAttempt } from '../entities';
import { BaseRepository } from '@app/database';

@Injectable()
export class PaymentAttemptRepository extends BaseRepository<PaymentAttempt> {
  constructor(
    @InjectRepository(PaymentAttempt)
    private paymentAttemptRepository: Repository<PaymentAttempt>
  ) {
    super(paymentAttemptRepository);
  }

  async findByPaymentId(paymentId: string): Promise<PaymentAttempt[]> {
    return this.paymentAttemptRepository.find({
      where: { paymentId },
      order: { createdAt: 'DESC' },
    });
  }
}
