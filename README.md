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

## Inbox retention

The payment, notification, and email databases run `pg_cron` to remove inbox messages older than 30 days. The cleanup runs every 15 minutes, deletes up to 1,000 rows per run, and leaves messages with `PROCESSING` status untouched.

The retention job is initialized when a database volume is created. To apply or reapply it to an existing database, run the initialization script manually:

```bash
docker compose exec payment-db psql -U payment_user -d payment_db -f /docker-entrypoint-initdb.d/01-pg-cron.sql
docker compose exec notification-db psql -U notification_user -d notification_db -f /docker-entrypoint-initdb.d/01-pg-cron.sql
docker compose exec email-db psql -U email_user -d email_db -f /docker-entrypoint-initdb.d/01-pg-cron.sql
```

The inbox TTL index is declared on the `InboxMessage` entity and is created by TypeORM when development schema synchronization is enabled. Production schema provisioning must create the same index before enabling the cleanup job.

## Notes

- Compose services are defined in `docker-compose.yml`.
- Additional docs live in `docs/`.
