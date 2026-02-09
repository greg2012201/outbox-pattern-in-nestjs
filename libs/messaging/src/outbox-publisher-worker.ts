import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClientProxy } from '@nestjs/microservices';
import { OutboxPublisher } from './outbox-publisher';

@Injectable()
export class OutboxPublisherWorker {
  private readonly logger = new Logger(OutboxPublisherWorker.name);

  constructor(
    @Inject('OUTBOX_CLIENT')
    private readonly client: ClientProxy,
    private readonly outboxPublisher: OutboxPublisher,
    @Inject('OUTBOX_EVENT_PATTERN_TRANSFORMER')
    private readonly transformPattern: (eventType: string) => string
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async publishPendingEvents() {
    try {
      const pendingEvents = await this.outboxPublisher.getPendingEvents();

      if (pendingEvents.length === 0) {
        return;
      }

      this.logger.log(`Found ${pendingEvents.length} pending events to publish`);

      for (const event of pendingEvents) {
        try {
          const pattern = this.transformPattern(event.eventType);
          const message = {
            id: event.id,
            ...event.payload,
          };

          await this.client.emit(pattern, message).toPromise();

          await this.outboxPublisher.markEventAsSent(event.id);
          this.logger.log(`Published event ${event.id} of type ${event.eventType}`);
        } catch (error) {
          this.logger.error(`Failed to publish event ${event.id}, will retry:`, error);
          await this.outboxPublisher.markEventAsFailed(event.id, event.retryCount);
        }
      }
    } catch (error) {
      this.logger.error('Error in OutboxPublisherWorker:', error);
    }
  }
}
