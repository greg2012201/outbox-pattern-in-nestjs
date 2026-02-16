import { HttpException, HttpStatus } from '@nestjs/common';

export class IdempotencyConflictException extends HttpException {
  constructor(idempotencyKey: string) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        message: `A request with idempotency key "${idempotencyKey}" is currently being processed. Please wait and retry.`,
        code: 'IDEMPOTENCY_CONFLICT',
      },
      HttpStatus.CONFLICT
    );
  }
}

export class MissingIdempotencyKeyException extends HttpException {
  constructor() {
    super(
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
}

export class InvalidIdempotencyKeyException extends HttpException {
  constructor(key: string) {
    super(
      {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'Unprocessable Entity',
        message: `The idempotency key "${key}" is not a valid UUID v4. Please provide a valid UUID.`,
        code: 'INVALID_IDEMPOTENCY_KEY',
      },
      HttpStatus.UNPROCESSABLE_ENTITY
    );
  }
}
