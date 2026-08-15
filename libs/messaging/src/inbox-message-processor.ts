import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { InboxClaimStatus } from './inbox.repository';
import { InboxService } from './inbox.service';

export type InboxMessageDelivery = {
  ack: () => void;
  nack: (requeue: boolean) => void;
};

export type InboxMessageHandler<TMessage> = {
  consumerId: string;
  pattern: string;
  getMessageId: (message: TMessage) => string | undefined;
  handle: (parameters: { message: TMessage; manager: EntityManager }) => Promise<unknown>;
};

export type InboxMessageProcessorParameters<TMessage> = {
  message: TMessage;
  delivery: InboxMessageDelivery;
  handler: InboxMessageHandler<TMessage>;
};

@Injectable()
export class InboxMessageProcessor {
  private readonly logger = new Logger(InboxMessageProcessor.name);

  constructor(private readonly inboxService: InboxService) {}

  async process<TMessage>({
    message,
    delivery,
    handler,
  }: InboxMessageProcessorParameters<TMessage>) {
    const messageId = handler.getMessageId(message)?.trim();

    if (!messageId) {
      this.logger.error(`Received ${handler.pattern} event without a valid message id`);
      delivery.nack(false);
      return;
    }

    try {
      const claim = await this.inboxService.claim({
        messageId,
        consumerId: handler.consumerId,
        pattern: handler.pattern,
        payload: message as unknown as Record<string, unknown>,
      });

      if (claim.status === InboxClaimStatus.PROCESSED) {
        this.logger.warn(`Event ${messageId} was already processed by ${handler.consumerId}`);
        delivery.ack();
        return;
      }

      if (claim.status === InboxClaimStatus.IN_FLIGHT) {
        this.logger.warn(`Event ${messageId} is already being processed by ${handler.consumerId}`);
        delivery.ack();
        return;
      }

      if (claim.status === InboxClaimStatus.EXHAUSTED) {
        this.logger.error(`Event ${messageId} exhausted inbox processing attempts`);
        delivery.nack(false);
        return;
      }

      if (
        claim.status !== InboxClaimStatus.CLAIMED &&
        claim.status !== InboxClaimStatus.RETRYABLE
      ) {
        throw new Error(`Unsupported inbox claim status: ${claim.status}`);
      }

      if (!claim.claimToken) {
        throw new Error(`Inbox claim for event ${messageId} has no claim token`);
      }

      await this.inboxService.runInTransaction({
        claim,
        work: (manager) => handler.handle({ message, manager }),
      });

      delivery.ack();
    } catch (error) {
      this.logger.error(`Error processing ${handler.pattern} event ${messageId}`, error);
      delivery.nack(true);
    }
  }
}
