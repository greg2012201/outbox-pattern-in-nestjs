import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Email } from '../entities';
import { BaseRepository } from '@app/database';

@Injectable()
export class EmailRepository extends BaseRepository<Email> {
  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>
  ) {
    super(emailRepository);
  }

  async findByOrderId(orderId: string): Promise<Email[]> {
    return this.emailRepository.find({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByEventId(eventId: string): Promise<Email | null> {
    return this.emailRepository.findOne({
      where: { eventId },
    });
  }
}
