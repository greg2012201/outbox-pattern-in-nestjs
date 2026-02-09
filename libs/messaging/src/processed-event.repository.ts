import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProcessedEvent } from '@app/database';

@Injectable()
export class ProcessedEventRepository {
  constructor(
    @InjectRepository(ProcessedEvent)
    private readonly processedEventRepository: Repository<ProcessedEvent>
  ) {}

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
