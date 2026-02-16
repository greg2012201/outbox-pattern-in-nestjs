import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import { Observable, of, from, throwError } from 'rxjs';
import { mergeMap, map, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';
import { IdempotencyService } from '../services/idempotency.service';
import {
  IdempotencyConflictException,
  MissingIdempotencyKeyException,
  InvalidIdempotencyKeyException,
} from '../exceptions/idempotency.exception';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly idempotencyService: IdempotencyService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    if (request.method !== 'POST') {
      return next.handle();
    }

    const idempotencyKey = request.headers['idempotency-key'] as string | undefined;

    if (!idempotencyKey) {
      throw new MissingIdempotencyKeyException();
    }

    if (!UUID_V4_REGEX.test(idempotencyKey)) {
      throw new InvalidIdempotencyKeyException(idempotencyKey);
    }

    const result = await this.idempotencyService.acquireLock(idempotencyKey);

    if (result.status === 'completed') {
      this.logger.log(`Returning cached response for idempotency key: ${idempotencyKey}`);
      response.status(result.responseStatus);
      response.setHeader('X-Idempotency-Replayed', 'true');

      if (result.responseHeaders) {
        for (const [key, value] of Object.entries(result.responseHeaders)) {
          if (key.toLowerCase() !== 'x-idempotency-replayed') {
            response.setHeader(key, value);
          }
        }
      }

      return of(result.responseBody);
    }

    if (result.status === 'processing') {
      throw new IdempotencyConflictException(idempotencyKey);
    }

    return next.handle().pipe(
      mergeMap((responseBody) =>
        from(
          this.idempotencyService.complete({
            idempotencyKey,
            responseBody,
            responseStatus: response.statusCode || HttpStatus.CREATED,
            responseHeaders: {
              'content-type': response.getHeader('content-type') as string,
            },
          })
        ).pipe(map(() => responseBody))
      ),
      catchError((error) =>
        from(this.idempotencyService.unlock(idempotencyKey)).pipe(
          mergeMap(() => throwError(() => error))
        )
      )
    );
  }
}
