import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '@app/database/entities';
import { BaseRepository } from '@app/database/repositories';

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

  async findByEventId(eventId: string): Promise<Notification | null> {
    return this.notificationRepository.findOne({
      where: { eventId },
    });
  }
}
