import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { v4 as uuid } from 'uuid';
import { InboxMessageStatus } from '@app/database';
import {
  DEFAULT_INBOX_LEASE_DURATION_MS,
  DEFAULT_INBOX_MAX_ATTEMPTS,
  InboxClaimParameters,
  InboxClaimResult,
  InboxMarkFailedParameters,
  InboxMarkProcessedParameters,
  InboxRepository,
  InboxClaimStatus,
} from './inbox.repository';

export type InboxServiceOptions = {
  maxAttempts?: number;
  leaseDurationMs?: number;
  recoveryBatchSize?: number;
};

export type InboxTransactionParameters<T> = {
  claim: InboxClaimResult;
  work: (manager: EntityManager) => Promise<T>;
};

type PositiveIntegerParameters = {
  value: number | undefined;
  fallback: number;
};

type ActiveLeaseParameters = {
  leaseExpiresAt: Date | null;
  now: Date;
};

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(
    private readonly inboxRepository: InboxRepository,
    private readonly dataSource: DataSource,
    @Optional()
    @Inject('INBOX_OPTIONS')
    private readonly options?: InboxServiceOptions
  ) {}

  async claim(parameters: InboxClaimParameters) {
    const maxAttempts = this.getMaxAttempts(parameters.maxAttempts);
    const leaseDurationMs = this.getLeaseDuration(parameters.leaseDurationMs);
    const claimToken = uuid();

    return this.inboxRepository.withClaimTransaction({
      messageId: parameters.messageId,
      consumerId: parameters.consumerId,
      businessId: parameters.businessId,
      pattern: parameters.pattern,
      payload: parameters.payload,
      claimToken,
      leaseDurationMs,
      work: async ({ manager, message, now, leaseExpiresAt }) => {
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
          this.hasActiveLease({ leaseExpiresAt: message.leaseExpiresAt, now })
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
          await this.inboxRepository.updateMessage({
            manager,
            id: message.id,
            values: {
              status: InboxMessageStatus.FAILED,
              attemptCount: nextAttemptCount,
              processingStartedAt: null,
              leaseExpiresAt: null,
              claimToken: null,
              lastError: 'Processing lease expired',
            },
          });

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

        await this.inboxRepository.updateMessage({
          manager,
          id: message.id,
          values: {
            status: InboxMessageStatus.PROCESSING,
            attemptCount: nextAttemptCount,
            processingStartedAt: now,
            leaseExpiresAt,
            claimToken,
            lastError: null,
            processedAt: null,
          },
        });

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
      },
    });
  }

  async markProcessed(parameters: InboxMarkProcessedParameters) {
    return this.inboxRepository.markProcessed(parameters);
  }

  async markFailed(parameters: InboxMarkFailedParameters) {
    return this.inboxRepository.markFailed(parameters);
  }

  async runInTransaction<T>({ claim, work }: InboxTransactionParameters<T>) {
    if (!claim.claimToken) {
      throw new Error('A processing inbox claim is required');
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const result = await work(manager);
        const processed = await this.markProcessed({
          manager,
          messageId: claim.message.messageId,
          consumerId: claim.message.consumerId,
          claimToken: claim.claimToken,
        });

        if (!processed) {
          throw new Error(`Inbox message ${claim.message.id} is no longer active`);
        }

        return result;
      });
    } catch (error) {
      try {
        await this.markFailed({
          messageId: claim.message.messageId,
          consumerId: claim.message.consumerId,
          claimToken: claim.claimToken,
          error,
        });
      } catch (failureError) {
        this.logger.error('Failed to record inbox processing failure', failureError);
      }

      throw error;
    }
  }

  private getMaxAttempts(value: number | undefined) {
    return this.getPositiveInteger({
      value: value ?? this.options?.maxAttempts ?? this.getEnvironmentNumber('INBOX_MAX_ATTEMPTS'),
      fallback: DEFAULT_INBOX_MAX_ATTEMPTS,
    });
  }

  private getLeaseDuration(value: number | undefined) {
    return this.getPositiveInteger({
      value:
        value ??
        this.options?.leaseDurationMs ??
        this.getEnvironmentNumber('INBOX_LEASE_DURATION_MS'),
      fallback: DEFAULT_INBOX_LEASE_DURATION_MS,
    });
  }

  private getPositiveInteger({ value, fallback }: PositiveIntegerParameters) {
    if (value === undefined) {
      return fallback;
    }

    if (!Number.isInteger(value) || value <= 0) {
      throw new Error('Inbox numeric options must be positive integers');
    }

    return value;
  }

  private hasActiveLease({ leaseExpiresAt, now }: ActiveLeaseParameters) {
    return leaseExpiresAt !== null && leaseExpiresAt.getTime() > now.getTime();
  }

  private getEnvironmentNumber(name: string) {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value > 0 ? value : undefined;
  }
}
