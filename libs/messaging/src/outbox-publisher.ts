import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
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

  async getPendingEvents(): Promise<OutboxEvent[]> {
    return this.dataSource.getRepository(OutboxEvent).find({
      where: { status: OutboxEventStatus.PENDING },
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
        .update(eventId, { status: OutboxEventStatus.FAILED });
    } else {
      await this.dataSource.getRepository(OutboxEvent).update(eventId, { retryCount });
    }
  }
}
