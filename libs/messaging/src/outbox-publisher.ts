import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OutboxEvent, OutboxEventStatus } from '@app/database';
import { v4 as uuid } from 'uuid';

type ClaimResult = {
  claimId: string;
  events: OutboxEvent[];
};

@Injectable()
export class OutboxPublisher {
  constructor(private dataSource: DataSource) {}

  async publishEvent({
    aggregateType,
    aggregateId,
    eventType,
    payload,
  }: {
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, any>;
  }): Promise<OutboxEvent> {
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

  async claimPendingEvents(batchSize: number = 50): Promise<ClaimResult> {
    const claimId = uuid();

    const events = await this.dataSource.transaction(async (manager) => {
      const lockedRows: Array<{ id: string }> = await manager.query(
        `SELECT id FROM outbox_events
         WHERE status = $1
         ORDER BY "createdAt" ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED`,
        [OutboxEventStatus.PENDING, batchSize]
      );

      if (lockedRows.length === 0) {
        return [];
      }

      const ids = lockedRows.map((row) => row.id);

      await manager.query(
        `UPDATE outbox_events
         SET status = $1,
             "processingClaim" = $2,
             "processingStartedAt" = now()
         WHERE id = ANY($3)`,
        [OutboxEventStatus.PROCESSING, claimId, ids]
      );

      return manager.getRepository(OutboxEvent).find({
        where: { processingClaim: claimId, status: OutboxEventStatus.PROCESSING },
        order: { createdAt: 'ASC' },
      });
    });

    return { claimId, events };
  }

  async markEventAsSent({ eventId, claimId }: { eventId: string; claimId: string }): Promise<void> {
    await this.dataSource.getRepository(OutboxEvent).update(
      { id: eventId, processingClaim: claimId },
      {
        status: OutboxEventStatus.SENT,
        processedAt: new Date(),
        processingClaim: null,
        processingStartedAt: null,
      }
    );
  }

  async markEventAsFailed({
    eventId,
    claimId,
    retryCount,
  }: {
    eventId: string;
    claimId: string;
    retryCount: number;
  }): Promise<void> {
    if (retryCount >= 5) {
      await this.dataSource.getRepository(OutboxEvent).update(
        { id: eventId, processingClaim: claimId },
        {
          status: OutboxEventStatus.FAILED,
          retryCount,
          processingClaim: null,
          processingStartedAt: null,
        }
      );
    } else {
      await this.dataSource.getRepository(OutboxEvent).update(
        { id: eventId, processingClaim: claimId },
        {
          status: OutboxEventStatus.PENDING,
          retryCount,
          processingClaim: null,
          processingStartedAt: null,
        }
      );
    }
  }
}
