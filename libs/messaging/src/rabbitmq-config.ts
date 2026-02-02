import { Transport, RmqOptions } from '@nestjs/microservices';

export const getRabbitMQConfig = (queue: string): RmqOptions => ({
  transport: Transport.RMQ,
  options: {
    urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
    queue,
    queueOptions: {
      durable: true,
    },
    noAck: false,
    prefetchCount: 1,
  },
});
