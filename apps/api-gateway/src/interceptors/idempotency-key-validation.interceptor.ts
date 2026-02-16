import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class IdempotencyKeyValidationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();

    if (request.method !== 'POST') {
      return next.handle();
    }

    const idempotencyKey = request.headers['idempotency-key'] as string | undefined;

    if (!idempotencyKey) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          message:
            'The "Idempotency-Key" header is required for this request. Provide a unique UUID to ensure exactly-once processing.',
          code: 'MISSING_IDEMPOTENCY_KEY',
        },
        HttpStatus.BAD_REQUEST
      );
    }

    if (!UUID_V4_REGEX.test(idempotencyKey)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'Unprocessable Entity',
          message: `The idempotency key "${idempotencyKey}" is not a valid UUID v4. Please provide a valid UUID.`,
          code: 'INVALID_IDEMPOTENCY_KEY',
        },
        HttpStatus.UNPROCESSABLE_ENTITY
      );
    }

    return next.handle();
  }
}
