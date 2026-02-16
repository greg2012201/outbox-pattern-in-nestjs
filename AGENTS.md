# Project Guide

## Tech

- Node.js 20+
- TypeScript
- NestJS
- TypeORM
- PostgreSQL
- RabbitMQ (amqplib, amqp-connection-manager)
- Jest
- Testcontainers
- SWC
- ESLint, Prettier
- Docker Compose

## Scripts

- `npm run start`
- `npm run start:dev`
- `npm run start:debug`
- `npm run start:prod`
- `npm run build`
- `npm run test`
- `npm run test:watch`
- `npm run test:cov`
- `npm run test:debug`
- `npm run test:e2e`
- `npm run lint`
- `npm run format`
- `npm run start:all`
- `npm run start:all:dev`
- `npm run docker:up`
- `npm run docker:down`
- `npm run docker:purge`
- `npm run docker:logs`
- `npm run migrate`
- `npm run migrate:create`

## Structure

- `apps/api-gateway/`
- `apps/payment-service/`
- `apps/order-service/`
- `apps/notification-service/`
- `apps/email-service/`
- `libs/database/`
- `libs/messaging/`
- `docs/`
- `tools/scripts/`
- `test/integration/`

## API idempotency

- `POST /orders` requires `Idempotency-Key` (UUID v4) and rejects missing or invalid keys.
- Duplicate requests with the same key return the cached response and `X-Idempotency-Replayed: true`.
- Concurrent requests with the same key return `409` with code `IDEMPOTENCY_CONFLICT`.
