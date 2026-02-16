# Payment Service Outbox Pattern

Reference implementation of the outbox pattern for a payment service built with NestJS.

## Requirements

- Node.js 20+
- Docker

## Quick start

```bash
npm install
npm run docker:up
npm run start:all:dev
```

## Scripts

- `npm run start:dev`
- `npm run start:all:dev`
- `npm run build`
- `npm run test`

## API idempotency

- `POST /orders` requires `Idempotency-Key` (UUID v4).
- Reusing the same key returns the original response and includes `X-Idempotency-Replayed: true`.
- Concurrent requests with the same key return `409` with code `IDEMPOTENCY_CONFLICT`.

## Notes

- Compose services are defined in `docker-compose.yml`.
- Additional docs live in `docs/`.
