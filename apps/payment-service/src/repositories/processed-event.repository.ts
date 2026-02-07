import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProcessedEvent } from '@app/database/entities';
import { BaseRepository } from '@app/database/repositories';

@Injectable()
export class ProcessedEventRepository extends BaseRepository<ProcessedEvent> {
  constructor(
    @InjectRepository(ProcessedEvent)
    private processedEventRepository: Repository<ProcessedEvent>
  ) {
    super(processedEventRepository);
  }

  async findProcessedEvent(eventId: string, consumerId: string): Promise<ProcessedEvent | null> {
    return this.processedEventRepository.findOne({
      where: { eventId, consumerId },
    });
  }

  async markAsProcessed(eventId: string, consumerId: string): Promise<void> {
    await this.processedEventRepository.save({
      eventId,
      consumerId,
      processedAt: new Date(),
    });
  }
}
