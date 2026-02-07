import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClientProxy } from '@nestjs/microservices';
import { OutboxRepository } from '../repositories/outbox.repository';

@Injectable()
export class OutboxPublisherWorker {
  private readonly logger = new Logger(OutboxPublisherWorker.name);

  constructor(
    private readonly outboxRepository: OutboxRepository,
    @Inject('PAYMENT_SERVICE') private readonly paymentClient: ClientProxy
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async publishPendingEvents() {
    try {
      const pendingEvents = await this.outboxRepository.findPendingEvents();

      if (pendingEvents.length === 0) {
        return;
      }

      this.logger.log(`Found ${pendingEvents.length} pending events to publish`);

      for (const event of pendingEvents) {
        try {
          const subject = `payment.${event.eventType.toLowerCase()}`;
          const message = {
            id: event.id,
            ...event.payload,
          };

          await this.paymentClient.emit(subject, message).toPromise();

          await this.outboxRepository.markAsSent(event.id);
          this.logger.log(`Published event ${event.id} of type ${event.eventType}`);
        } catch (error) {
          this.logger.error(`Failed to publish event ${event.id}, will retry:`, error);
          await this.outboxRepository.markAsFailed(event.id, event.retryCount);
        }
      }
    } catch (error) {
      this.logger.error('Error in OutboxPublisherWorker:', error);
    }
  }
}
