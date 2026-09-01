import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Email } from '../entities';
import { BaseRepository } from '@app/database';

type SaveEmailParams = {
  manager: EntityManager;
  data: Partial<Email>;
};

@Injectable()
export class EmailRepository extends BaseRepository<Email> {
  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>
  ) {
    super(emailRepository);
  }

  async findByOrderId(orderId: string) {
    return this.emailRepository.find({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });
  }

  async saveEmail({ manager, data }: SaveEmailParams) {
    const repository = manager.getRepository(Email);
    return repository.save(repository.create(data));
  }
}
