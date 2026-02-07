import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClientProxy } from '@nestjs/microservices';
import { Inject } from '@nestjs/common';
import { OutboxRepository } from '../repositories/outbox.repository';

@Injectable()
export class OutboxPublisherWorker {
  private readonly logger = new Logger(OutboxPublisherWorker.name);

  constructor(
    @Inject('ORDER_SERVICE')
    private client: ClientProxy,
    private readonly outboxRepository: OutboxRepository
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async publishPendingEvents(): Promise<void> {
    try {
      const pendingEvents = await this.outboxRepository.findPendingEvents();

      for (const event of pendingEvents) {
        try {
          await this.client
            .emit(event.eventType.toLowerCase().replace(/([A-Z])/g, '.$1'), {
              ...event.payload,
              id: event.id,
            })
            .toPromise();

          await this.outboxRepository.markAsSent(event.id);
          this.logger.log(`Event ${event.id} published successfully`);
        } catch (error) {
          this.logger.error(`Failed to publish event ${event.id}:`, error.message);
          await this.outboxRepository.markAsFailed(event.id, event.retryCount);
        }
      }
    } catch (error) {
      this.logger.error('Error in outbox publisher worker:', error.message);
    }
  }
}
