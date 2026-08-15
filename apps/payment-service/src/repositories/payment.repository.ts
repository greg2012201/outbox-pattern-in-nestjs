import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Payment } from '../entities';
import { BaseRepository } from '@app/database';

type FindByOrderIdOptions = {
  orderId: string;
  manager?: EntityManager;
};

@Injectable()
export class PaymentRepository extends BaseRepository<Payment> {
  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>
  ) {
    super(paymentRepository);
  }

  async findByOrderId({ orderId, manager }: FindByOrderIdOptions) {
    const repository = manager?.getRepository(Payment) ?? this.paymentRepository;

    return repository.findOne({
      where: { orderId },
    });
  }
}
