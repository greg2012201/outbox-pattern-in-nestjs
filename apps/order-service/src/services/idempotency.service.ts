import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { IdempotencyRecord } from '@app/database';

type AcquireLockResult =
  | { status: 'acquired' }
  | { status: 'processing' }
  | {
      status: 'completed';
      responseBody: Record<string, any>;
      responseStatus: number;
      responseHeaders: Record<string, string> | null;
    };

type CompleteParams = {
  idempotencyKey: string;
  responseBody: Record<string, any>;
  responseStatus: number;
  responseHeaders?: Record<string, string>;
};

const IDEMPOTENCY_TTL_HOURS = 24;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 100;

function isUniqueConstraintError(error: unknown) {
  return error instanceof Object && 'code' in error && (error as { code: string }).code === '23505';
}

async function withRetry<T>(operation: () => Promise<T>, logger: Logger, label: string) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        logger.warn(`${label} failed (attempt ${attempt}/${MAX_RETRIES}), retrying...`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
      }
    }
  }

  throw lastError;
}

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(
    @InjectRepository(IdempotencyRecord)
    private readonly idempotencyRepository: Repository<IdempotencyRecord>
  ) {}

  async acquireLock(idempotencyKey: string): Promise<AcquireLockResult> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + IDEMPOTENCY_TTL_HOURS);

    try {
      await this.idempotencyRepository
        .createQueryBuilder()
        .insert()
        .into(IdempotencyRecord)
        .values({
          idempotencyKey,
          isProcessing: true,
          responseBody: null,
          responseStatus: null,
          responseHeaders: null,
          expiresAt,
        })
        .orIgnore()
        .execute();

      const inserted = await this.idempotencyRepository.findOne({
        where: { idempotencyKey },
      });

      if (inserted && inserted.isProcessing && inserted.responseBody === null) {
        return { status: 'acquired' };
      }

      if (!inserted || inserted.expiresAt < new Date()) {
        if (inserted) {
          await this.idempotencyRepository.delete({ idempotencyKey });
        }
        await this.idempotencyRepository
          .createQueryBuilder()
          .insert()
          .into(IdempotencyRecord)
          .values({
            idempotencyKey,
            isProcessing: true,
            responseBody: null,
            responseStatus: null,
            responseHeaders: null,
            expiresAt,
          })
          .execute();
        return { status: 'acquired' };
      }

      if (inserted.isProcessing) {
        return { status: 'processing' };
      }

      return {
        status: 'completed',
        responseBody: inserted.responseBody,
        responseStatus: inserted.responseStatus,
        responseHeaders: inserted.responseHeaders,
      };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const existing = await this.idempotencyRepository.findOne({
          where: { idempotencyKey },
        });

        if (!existing) {
          return { status: 'processing' };
        }

        if (existing.isProcessing) {
          return { status: 'processing' };
        }

        return {
          status: 'completed',
          responseBody: existing.responseBody,
          responseStatus: existing.responseStatus,
          responseHeaders: existing.responseHeaders,
        };
      }

      throw error;
    }
  }

  async complete({
    idempotencyKey,
    responseBody,
    responseStatus,
    responseHeaders,
  }: CompleteParams) {
    await withRetry(
      () =>
        this.idempotencyRepository.update(
          { idempotencyKey },
          {
            isProcessing: false,
            responseBody,
            responseStatus,
            responseHeaders: responseHeaders ?? null,
          }
        ),
      this.logger,
      `complete(${idempotencyKey})`
    );
  }

  async unlock(idempotencyKey: string) {
    await withRetry(
      () => this.idempotencyRepository.delete({ idempotencyKey }),
      this.logger,
      `unlock(${idempotencyKey})`
    );
  }

  async cleanupExpired() {
    await this.idempotencyRepository.delete({
      expiresAt: LessThan(new Date()),
    });
  }
}
