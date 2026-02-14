# Manual Testing: curl Cheat Sheet

This file contains ready-to-run `curl` examples for manually exercising the API Gateway, inspecting orders, and publishing events to RabbitMQ (via the management HTTP API). Adjust host/ports and credentials to match your local `.env` files.

Prerequisites:

- API Gateway running at `http://localhost:3001`
- RabbitMQ management UI available at `http://localhost:15672` (optional; used for publishing test events)
- `jq` installed (optional, used to extract ids from responses)

Environment variables (change as needed):

```bash
API_HOST="http://localhost:3001"
RABBITMQ_API="http://localhost:15672/api"
RABBITMQ_USER="guest"
RABBITMQ_PASS="guest"
RABBITMQ_VHOST="/"
ORDER_EXCHANGE="order.events"
PAYMENT_EXCHANGE="payment.events"
```

1. Create an order (happy path)

```bash
curl -v -X POST "http://localhost:3001/orders" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "currency": "USD",
    "totalAmount": 49.95,
    "items": [
      {"productId": "prod-abc", "quantity": 1, "unitPrice": 29.95},
      {"productId": "prod-def", "quantity": 1, "unitPrice": 20.00}
    ]
  }'

# Example: extract order id from response (if response contains `id`)
curl -s -X POST "$API_HOST/orders" -H "Content-Type: application/json" -d '{"userId":"u1","currency":"USD","totalAmount":10,"items":[{"productId":"p1","quantity":1,"unitPrice":10}]}' | jq -r '.id'
```

2. Create an invalid order (validation error)

```bash
curl -v -X POST "$API_HOST/orders" \
  -H "Content-Type: application/json" \
  -d '{ "userId": "", "items": [] }'
```

3. Get order by id

```bash
ORDER_ID="<paste-order-id-here>"
curl -v "$API_HOST/orders/$ORDER_ID"
```

4. Poll order status until it's PAID (useful to wait for payment processing)

```bash
ORDER_ID="<paste-order-id-here>"
API="$API_HOST/orders/$ORDER_ID"
echo "Polling $API for status..."
until [ "$(curl -s $API | jq -r '.status')" = "PAID" ]; do
  echo -n '.'; sleep 2
done
echo "\nOrder $ORDER_ID is PAID"
```

5. (Optional) Publish an `order.created` domain event directly to RabbitMQ via the management HTTP API

# Use this when you want to simulate the OrderCreated event without creating an order through the API Gateway.

```bash
cat > order-created.json <<EOF
{
  "properties": {},
  "routing_key": "order.created",
  "payload": "{\"id\": \"${ORDER_ID:-order-test-1}\", \"orderId\": \"${ORDER_ID:-order-test-1}\", \"userId\": \"user-123\", \"totalAmount\": 49.95, \"currency\": \"USD\", \"items\": [{\"productId\": \"prod-abc\", \"quantity\": 1, \"unitPrice\": 49.95}]}",
  "payload_encoding": "string"
}
EOF

curl -u "$RABBITMQ_USER:$RABBITMQ_PASS" -H "content-type: application/json" \
  -X POST "$RABBITMQ_API/exchanges/$RABBITMQ_VHOST/$ORDER_EXCHANGE/publish" \
  -d @order-created.json
```

6. (Optional) Publish a `payment.completed` event to test downstream consumers (notification, email, accounting)

```bash
cat > payment-completed.json <<EOF
{
  "properties": {},
  "routing_key": "payment.completed",
  "payload": "{\"paymentId\": \"pay-123\", \"orderId\": \"${ORDER_ID:-order-test-1}\", \"amount\": 49.95, \"currency\": \"USD\", \"transactionId\": \"tx-789\"}",
  "payload_encoding": "string"
}
EOF

curl -u "$RABBITMQ_USER:$RABBITMQ_PASS" -H "content-type: application/json" \
  -X POST "$RABBITMQ_API/exchanges/$RABBITMQ_VHOST/$PAYMENT_EXCHANGE/publish" \
  -d @payment-completed.json
```

7. Inspect RabbitMQ queues (useful to see message counts / DLQs)

```bash
# List queues
curl -u "$RABBITMQ_USER:$RABBITMQ_PASS" "$RABBITMQ_API/queues"

# Inspect a specific queue
QUEUE_NAME="notification.payment-completed"
curl -u "$RABBITMQ_USER:$RABBITMQ_PASS" "$RABBITMQ_API/queues/$RABBITMQ_VHOST/$QUEUE_NAME"
```

8. Replaying an event (idempotency testing)

# Re-publish the same `payment.completed` payload twice and verify downstream services handle duplicates idempotently.

```bash
curl -u "$RABBITMQ_USER:$RABBITMQ_PASS" -H "content-type: application/json" \
  -X POST "$RABBITMQ_API/exchanges/$RABBITMQ_VHOST/$PAYMENT_EXCHANGE/publish" \
  -d @payment-completed.json

# Publish again
curl -u "$RABBITMQ_USER:$RABBITMQ_PASS" -H "content-type: application/json" \
  -X POST "$RABBITMQ_API/exchanges/$RABBITMQ_VHOST/$PAYMENT_EXCHANGE/publish" \
  -d @payment-completed.json
```

Notes & tips:

- If your services are behind different ports change `API_HOST` accordingly (see `.env` templates in `payment-service-plan.md`).
- The RabbitMQ management API approach uses the management plugin and is intended for manual testing only — prefer production-safe tooling for automated tests.
- If your API returns a different JSON shape adapt the `jq` extraction commands accordingly.

File: `docs/CURL-TESTS.md`
