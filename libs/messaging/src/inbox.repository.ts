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

type NormalizePositiveIntegerParameters = {
  value: number | undefined;
  fallback: number;
};

type ActiveLeaseParameters = {
  leaseExpiresAt: Date | null;
  now: Date;
};

function normalizePositiveInteger({ value, fallback }: NormalizePositiveIntegerParameters) {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('Inbox numeric options must be positive integers');
  }

  return value;
}

function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 2000);
}

function hasActiveLease({ leaseExpiresAt, now }: ActiveLeaseParameters) {
  return leaseExpiresAt !== null && leaseExpiresAt.getTime() > now.getTime();
}

@Injectable()
export class InboxRepository {
  constructor(private readonly dataSource: DataSource) {}

  async claim({
    messageId,
    consumerId,
    businessId,
    pattern,
    payload,
    maxAttempts: requestedMaxAttempts,
    leaseDurationMs: requestedLeaseDurationMs,
  }: InboxClaimParameters) {
    const maxAttempts = normalizePositiveInteger({
      value: requestedMaxAttempts,
      fallback: DEFAULT_INBOX_MAX_ATTEMPTS,
    });
    const leaseDurationMs = normalizePositiveInteger({
      value: requestedLeaseDurationMs,
      fallback: DEFAULT_INBOX_LEASE_DURATION_MS,
    });
    const claimToken = uuid();

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

      if (message.claimToken === claimToken) {
        return {
          status: InboxClaimStatus.CLAIMED,
          message,
          claimToken,
        };
      }

      if (message.status === InboxMessageStatus.PROCESSED) {
        return {
          status: InboxClaimStatus.PROCESSED,
          message,
          claimToken: null,
        };
      }

      if (
        message.status === InboxMessageStatus.PROCESSING &&
        hasActiveLease({ leaseExpiresAt: message.leaseExpiresAt, now })
      ) {
        return {
          status: InboxClaimStatus.IN_FLIGHT,
          message,
          claimToken: null,
        };
      }

      if (
        message.status === InboxMessageStatus.FAILED &&
        (message.attemptCount ?? 0) > maxAttempts
      ) {
        return {
          status: InboxClaimStatus.EXHAUSTED,
          message,
          claimToken: null,
        };
      }

      const nextAttemptCount =
        message.status === InboxMessageStatus.FAILED
          ? message.attemptCount
          : (message.attemptCount ?? 0) + 1;

      if (nextAttemptCount > maxAttempts) {
        await manager.getRepository(InboxMessage).update(
          { id: message.id },
          {
            status: InboxMessageStatus.FAILED,
            attemptCount: nextAttemptCount,
            processingStartedAt: null,
            leaseExpiresAt: null,
            claimToken: null,
            lastError: 'Processing lease expired',
          }
        );

        message.status = InboxMessageStatus.FAILED;
        message.attemptCount = nextAttemptCount;
        message.processingStartedAt = null;
        message.leaseExpiresAt = null;
        message.claimToken = null;

        return {
          status: InboxClaimStatus.EXHAUSTED,
          message,
          claimToken: null,
        };
      }

      await manager.getRepository(InboxMessage).update(
        { id: message.id },
        {
          status: InboxMessageStatus.PROCESSING,
          attemptCount: nextAttemptCount,
          processingStartedAt: now,
          leaseExpiresAt,
          claimToken,
          lastError: null,
          processedAt: null,
        }
      );

      message.status = InboxMessageStatus.PROCESSING;
      message.attemptCount = nextAttemptCount;
      message.processingStartedAt = now;
      message.leaseExpiresAt = leaseExpiresAt;
      message.claimToken = claimToken;

      return {
        status: InboxClaimStatus.RETRYABLE,
        message,
        claimToken,
      };
    });
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

  async recoverExpired({
    limit: requestedLimit,
    now: requestedNow,
  }: InboxRecoverExpiredParameters = {}) {
    const limit = Math.min(
      normalizePositiveInteger({
        value: requestedLimit,
        fallback: DEFAULT_INBOX_RECOVERY_BATCH_SIZE,
      }),
      MAX_INBOX_RECOVERY_BATCH_SIZE
    );

    return this.dataSource.transaction(async (manager) => {
      const now = requestedNow ?? new Date();
      const messages = await manager
        .getRepository(InboxMessage)
        .createQueryBuilder('inboxMessage')
        .where('inboxMessage.status = :status', { status: InboxMessageStatus.PROCESSING })
        .andWhere('inboxMessage.leaseExpiresAt IS NOT NULL')
        .andWhere('inboxMessage.leaseExpiresAt <= :now', { now })
        .orderBy('inboxMessage.leaseExpiresAt', 'ASC')
        .take(limit)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();

      if (messages.length === 0) {
        return 0;
      }

      const result = await manager.getRepository(InboxMessage).update(
        messages.map(({ id }) => id),
        {
          status: InboxMessageStatus.FAILED,
          processingStartedAt: null,
          leaseExpiresAt: null,
          claimToken: null,
          lastError: 'Processing lease expired',
          attemptCount: () => '"attemptCount" + 1',
        }
      );

      return result.affected ?? 0;
    });
  }
}
