import { Transport, RmqOptions } from '@nestjs/microservices';

type RabbitMQConfigOptions = {
  queue: string;
  noAck?: boolean;
  exchange?: string;
};

export function getRabbitMQConfig({
  queue,
  noAck = false,
  exchange,
}: RabbitMQConfigOptions): RmqOptions {
  const config: RmqOptions = {
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
      queue,
      queueOptions: {
        durable: true,
      },
      noAck,
      prefetchCount: 0,
    },
  };

  if (exchange) {
    (config.options as any).exchange = exchange;
    (config.options as any).exchangeType = 'fanout';
  }

  return config;
}
