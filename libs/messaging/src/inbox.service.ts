import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  DEFAULT_INBOX_LEASE_DURATION_MS,
  DEFAULT_INBOX_MAX_ATTEMPTS,
  DEFAULT_INBOX_RECOVERY_BATCH_SIZE,
  InboxClaimParameters,
  InboxMarkFailedParameters,
  InboxMarkProcessedParameters,
  InboxRecoverExpiredParameters,
  InboxRepository,
  InboxClaimResult,
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
    return this.inboxRepository.claim({
      ...parameters,
      maxAttempts:
        parameters.maxAttempts ??
        this.options?.maxAttempts ??
        this.getEnvironmentNumber('INBOX_MAX_ATTEMPTS') ??
        DEFAULT_INBOX_MAX_ATTEMPTS,
      leaseDurationMs:
        parameters.leaseDurationMs ??
        this.options?.leaseDurationMs ??
        this.getEnvironmentNumber('INBOX_LEASE_DURATION_MS') ??
        DEFAULT_INBOX_LEASE_DURATION_MS,
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

  async recoverExpired(parameters: InboxRecoverExpiredParameters = {}) {
    return this.inboxRepository.recoverExpired({
      ...parameters,
      limit:
        parameters.limit ??
        this.options?.recoveryBatchSize ??
        this.getEnvironmentNumber('INBOX_RECOVERY_BATCH_SIZE') ??
        DEFAULT_INBOX_RECOVERY_BATCH_SIZE,
    });
  }

  private getEnvironmentNumber(name: string) {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value > 0 ? value : undefined;
  }
}
