import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { InboxMessage, InboxMessageStatus } from '@app/database';
import { v4 as uuid } from 'uuid';

export const DEFAULT_INBOX_MAX_ATTEMPTS = 5;
export const DEFAULT_INBOX_LEASE_DURATION_MS = 60_000;
export const DEFAULT_INBOX_RECOVERY_BATCH_SIZE = 100;
export const MAX_INBOX_RECOVERY_BATCH_SIZE = 100;

export enum InboxClaimStatus {
  CLAIMED = 'CLAIMED',
  PROCESSED = 'PROCESSED',
  IN_FLIGHT = 'IN_FLIGHT',
  RETRYABLE = 'RETRYABLE',
  EXHAUSTED = 'EXHAUSTED',
}

export type InboxClaimParameters = {
  messageId: string;
  consumerId: string;
  businessId: string;
  pattern: string;
  payload: Record<string, any>;
  maxAttempts?: number;
  leaseDurationMs?: number;
};

export type InboxClaimPreparationParameters = {
  messageId: string;
  consumerId: string;
  businessId: string;
  pattern: string;
  payload: Record<string, any>;
  claimToken: string;
  leaseDurationMs: number;
};

export type InboxClaimTransactionContext = {
  manager: EntityManager;
  message: InboxMessage;
  claimToken: string;
  now: Date;
  leaseExpiresAt: Date;
};

export type InboxClaimTransactionParameters<T> = InboxClaimPreparationParameters & {
  work: (context: InboxClaimTransactionContext) => Promise<T>;
};

export type InboxUpdateMessageParameters = {
  manager: EntityManager;
  id: string;
  values: Partial<InboxMessage>;
};

export type InboxClaimResult = {
  status: InboxClaimStatus;
  message: InboxMessage;
  claimToken: string | null;
};

export type InboxMarkProcessedParameters = {
  manager: EntityManager;
  messageId: string;
  consumerId: string;
  claimToken: string;
};

export type InboxMarkFailedParameters = {
  messageId: string;
  consumerId: string;
  claimToken: string;
  error: unknown;
};

export type InboxRecoverExpiredParameters = {
  limit?: number;
  now?: Date;
};

function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 2000);
}

@Injectable()
export class InboxRepository {
  constructor(private readonly dataSource: DataSource) {}

  async withClaimTransaction<T>({
    messageId,
    consumerId,
    businessId,
    pattern,
    payload,
    claimToken,
    leaseDurationMs,
    work,
  }: InboxClaimTransactionParameters<T>) {
    return this.dataSource.transaction(async (manager) => {
      const now = new Date();
      const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

      await manager
        .createQueryBuilder()
        .insert()
        .into(InboxMessage)
        .values({
          id: uuid(),
          messageId,
          consumerId,
          businessId,
          pattern,
          payload,
          status: InboxMessageStatus.PROCESSING,
          attemptCount: 1,
          receivedAt: now,
          processingStartedAt: now,
          leaseExpiresAt,
          processedAt: null,
          claimToken,
          lastError: null,
        })
        .orIgnore()
        .execute();

      const message = await manager
        .getRepository(InboxMessage)
        .createQueryBuilder('inboxMessage')
        .where('inboxMessage.messageId = :messageId', { messageId })
        .andWhere('inboxMessage.consumerId = :consumerId', { consumerId })
        .andWhere('inboxMessage.businessId = :businessId', { businessId })
        .setLock('pessimistic_write')
        .getOne();

      if (!message) {
        throw new Error(`Inbox message ${messageId} was not created or found`);
      }

      return work({
        manager,
        message,
        claimToken,
        now,
        leaseExpiresAt,
      });
    });
  }

  async updateMessage({ manager, id, values }: InboxUpdateMessageParameters) {
    await manager.getRepository(InboxMessage).update({ id }, values);
  }

  async markProcessed({
    manager,
    messageId,
    consumerId,
    claimToken,
  }: InboxMarkProcessedParameters) {
    const result = await manager.getRepository(InboxMessage).update(
      {
        messageId,
        consumerId,
        claimToken,
        status: InboxMessageStatus.PROCESSING,
      },
      {
        status: InboxMessageStatus.PROCESSED,
        processedAt: new Date(),
        processingStartedAt: null,
        leaseExpiresAt: null,
        claimToken: null,
        lastError: null,
      }
    );

    return result.affected === 1;
  }

  async markFailed({ messageId, consumerId, claimToken, error }: InboxMarkFailedParameters) {
    return this.dataSource.transaction(async (manager) => {
      const result = await manager.getRepository(InboxMessage).update(
        {
          messageId,
          consumerId,
          claimToken,
          status: InboxMessageStatus.PROCESSING,
        },
        {
          status: InboxMessageStatus.FAILED,
          attemptCount: () => '"attemptCount" + 1',
          processingStartedAt: null,
          leaseExpiresAt: null,
          claimToken: null,
          processedAt: null,
          lastError: sanitizeError(error),
        }
      );

      return result.affected === 1;
    });
  }
}
