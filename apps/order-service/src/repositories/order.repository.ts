import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseRepository } from '@app/database';
import { Order } from '../entities';

@Injectable()
export class OrderRepository extends BaseRepository<Order> {
  constructor(
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>
  ) {
    super(ordersRepository);
  }

  async findByIdWithItems(id: string): Promise<Order | null> {
    return this.ordersRepository.findOne({
      where: { id },
      relations: ['items'],
    });
  }

  async findAllWithPagination(
    skip: number = 0,
    take: number = 10
  ): Promise<{ data: Order[]; total: number }> {
    const [data, total] = await this.ordersRepository.findAndCount({
      relations: ['items'],
      skip,
      take,
    });
    return { data, total };
  }
}
