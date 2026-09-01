import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Notification } from '../entities';
import { BaseRepository } from '@app/database';

type CreateNotificationParams = {
  manager: EntityManager;
  data: Partial<Notification>;
};

@Injectable()
export class NotificationRepository extends BaseRepository<Notification> {
  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>
  ) {
    super(notificationRepository);
  }

  async findByOrderId(orderId: string): Promise<Notification[]> {
    return this.notificationRepository.find({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });
  }

  async createNotification({ manager, data }: CreateNotificationParams) {
    const repository = manager.getRepository(Notification);
    return repository.save(repository.create(data));
  }
}
