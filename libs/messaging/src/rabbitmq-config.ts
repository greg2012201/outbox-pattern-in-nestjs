import { RmqOptions, Transport } from '@nestjs/microservices';

const DEFAULT_PREFETCH_COUNT = 1;
const DEFAULT_MAX_DELIVERIES = 5;
const DEAD_LETTER_EXCHANGE_SUFFIX = '.dlx';
const DEAD_LETTER_QUEUE_SUFFIX = '.dlq';

export type RabbitMQConfigOptions = {
  queue: string;
  noAck?: boolean;
  exchange?: string;
  prefetchCount?: number;
  maxDeliveries?: number;
};

export type RabbitMQQueueTopology = {
  queue: string;
  deadLetterExchange: string;
  deadLetterQueue: string;
  deadLetterRoutingKey: string;
};

function getPositiveInteger(value: number | string | undefined) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

export function getRabbitMQPrefetchCount(prefetchCount?: number) {
  return (
    getPositiveInteger(prefetchCount) ??
    getPositiveInteger(process.env.RABBITMQ_PREFETCH_COUNT) ??
    DEFAULT_PREFETCH_COUNT
  );
}

export function getRabbitMQMaxDeliveries(maxDeliveries?: number) {
  return (
    getPositiveInteger(maxDeliveries) ??
    getPositiveInteger(process.env.RABBITMQ_MAX_DELIVERIES) ??
    DEFAULT_MAX_DELIVERIES
  );
}

export function getRabbitMQQueueTopology(queue: string) {
  const deadLetterExchange = `${queue}${DEAD_LETTER_EXCHANGE_SUFFIX}`;
  const deadLetterQueue = `${queue}${DEAD_LETTER_QUEUE_SUFFIX}`;

  return {
    queue,
    deadLetterExchange,
    deadLetterQueue,
    deadLetterRoutingKey: deadLetterQueue,
  };
}

export function getRabbitMQQueueOptions(queue: string, maxDeliveries?: number) {
  const { deadLetterExchange, deadLetterRoutingKey } = getRabbitMQQueueTopology(queue);

  return {
    durable: true,
    deadLetterExchange,
    deadLetterRoutingKey,
    arguments: {
      'x-queue-type': 'quorum',
      'x-delivery-limit': getRabbitMQMaxDeliveries(maxDeliveries),
    },
  };
}

export function getRabbitMQConfig({
  queue,
  noAck = false,
  exchange,
  prefetchCount,
  maxDeliveries,
}: RabbitMQConfigOptions) {
  const config: RmqOptions = {
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
      queue,
      queueOptions: getRabbitMQQueueOptions(queue, maxDeliveries),
      noAck,
      prefetchCount: getRabbitMQPrefetchCount(prefetchCount),
      persistent: true,
    },
  };

  if (exchange) {
    config.options!.exchange = exchange;
    config.options!.exchangeType = 'fanout';
  }

  return config;
}
