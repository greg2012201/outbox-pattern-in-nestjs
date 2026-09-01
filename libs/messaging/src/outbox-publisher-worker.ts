import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxPublisher } from './outbox-publisher';

type MessagePublisher = {
  publish(pattern: string, message: Record<string, any>): Promise<void>;
};

@Injectable()
export class OutboxPublisherWorker {
  private readonly logger = new Logger(OutboxPublisherWorker.name);
  private isProcessing = false;

  constructor(
    @Inject('OUTBOX_MESSAGE_PUBLISHER')
    private readonly messagePublisher: MessagePublisher,
    private readonly outboxPublisher: OutboxPublisher,
    @Inject('OUTBOX_EVENT_PATTERN_TRANSFORMER')
    private readonly transformPattern: (eventType: string) => string
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async publishPendingEvents() {
    if (this.isProcessing) {
      this.logger.warn('Previous outbox processing still running, skipping this cycle');
      return;
    }

    this.isProcessing = true;

    try {
      const { claimId, events } = await this.outboxPublisher.claimPendingEvents();
      if (events.length === 0) {
        return;
      }

      this.logger.log(`Claimed ${events.length} events (claimId: ${claimId})`);

      for (const event of events) {
        try {
          const pattern = this.transformPattern(event.eventType);
          const message = {
            id: event.id,
            ...event.payload,
            businessId: event.aggregateId,
          };

          await this.messagePublisher.publish(pattern, message);

          await this.outboxPublisher.markEventAsSent({ eventId: event.id, claimId });
          this.logger.log(`Published event ${event.id} of type ${event.eventType}`);
        } catch (error) {
          this.logger.error(`Failed to publish event ${event.id}, will retry:`, error);
          await this.outboxPublisher.markEventAsFailed({
            eventId: event.id,
            claimId,
            retryCount: event.retryCount + 1,
          });
        }
      }
    } catch (error) {
      this.logger.error('Error in OutboxPublisherWorker:', error);
    } finally {
      this.isProcessing = false;
    }
  }
}
