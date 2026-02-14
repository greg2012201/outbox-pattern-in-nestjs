import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { OutboxEvent, OutboxEventStatus } from '@app/database';
import { v4 as uuid } from 'uuid';

@Injectable()
export class OutboxPublisher {
  constructor(private dataSource: DataSource) {}

  async publishEvent(
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    payload: Record<string, any>
  ): Promise<OutboxEvent> {
    const outboxEvent = new OutboxEvent();
    outboxEvent.id = uuid();
    outboxEvent.aggregateType = aggregateType;
    outboxEvent.aggregateId = aggregateId;
    outboxEvent.eventType = eventType;
    outboxEvent.payload = payload;
    outboxEvent.status = OutboxEventStatus.PENDING;
    outboxEvent.retryCount = 0;

    return this.dataSource.getRepository(OutboxEvent).save(outboxEvent);
  }

  async claimPendingEvents(batchSize: number = 50): Promise<OutboxEvent[]> {
    const repo = this.dataSource.getRepository(OutboxEvent);

    const pendingEvents = await repo.find({
      where: { status: OutboxEventStatus.PENDING },
      order: { createdAt: 'ASC' },
      take: batchSize,
    });

    if (pendingEvents.length === 0) {
      return [];
    }

    const ids = pendingEvents.map((e) => e.id);

    const result = await repo
      .createQueryBuilder()
      .update(OutboxEvent)
      .set({ status: OutboxEventStatus.PROCESSING })
      .where('id IN (:...ids)', { ids })
      .andWhere('status = :status', { status: OutboxEventStatus.PENDING })
      .execute();

    if (result.affected === 0) {
      return [];
    }

    return repo.find({
      where: { id: In(ids), status: OutboxEventStatus.PROCESSING },
      order: { createdAt: 'ASC' },
    });
  }

  async markEventAsSent(eventId: string): Promise<void> {
    await this.dataSource
      .getRepository(OutboxEvent)
      .update(eventId, { status: OutboxEventStatus.SENT, processedAt: new Date() });
  }

  async markEventAsFailed(eventId: string, retryCount: number): Promise<void> {
    if (retryCount >= 5) {
      await this.dataSource
        .getRepository(OutboxEvent)
        .update(eventId, { status: OutboxEventStatus.FAILED, retryCount });
    } else {
      await this.dataSource
        .getRepository(OutboxEvent)
        .update(eventId, { status: OutboxEventStatus.PENDING, retryCount });
    }
  }
}
