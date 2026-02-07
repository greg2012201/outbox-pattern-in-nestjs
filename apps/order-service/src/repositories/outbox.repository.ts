import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutboxEvent, OutboxEventStatus } from '@app/database/entities';
import { BaseRepository } from '@app/database/repositories';

@Injectable()
export class OutboxRepository extends BaseRepository<OutboxEvent> {
  constructor(
    @InjectRepository(OutboxEvent)
    private outboxRepository: Repository<OutboxEvent>
  ) {
    super(outboxRepository);
  }

  async findPendingEvents(): Promise<OutboxEvent[]> {
    return this.outboxRepository.find({
      where: { status: OutboxEventStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
  }

  async markAsSent(id: string): Promise<void> {
    await this.outboxRepository.update(id, {
      status: OutboxEventStatus.SENT,
      processedAt: new Date(),
    });
  }

  async markAsFailed(id: string, retryCount: number): Promise<void> {
    if (retryCount >= 5) {
      await this.outboxRepository.update(id, {
        status: OutboxEventStatus.FAILED,
        retryCount,
        processedAt: new Date(),
      });
    } else {
      await this.outboxRepository.update(id, {
        retryCount: retryCount + 1,
      });
    }
  }

  async findFailedEvents(): Promise<OutboxEvent[]> {
    return this.outboxRepository.find({
      where: { status: OutboxEventStatus.FAILED },
    });
  }
}
