import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { connect, AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import { ConfirmChannel } from 'amqplib';
import { getRabbitMQQueueOptions, getRabbitMQQueueTopology } from './rabbitmq-config';

export type QueueBinding = {
  exchange?: string;
  queue: string;
  maxDeliveries?: number;
};

@Injectable()
export class QueueBindingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueBindingService.name);
  private connection: AmqpConnectionManager;
  private channel: ChannelWrapper;

  constructor(
    @Inject('QUEUE_BINDINGS')
    private readonly bindings: QueueBinding[]
  ) {}

  async onModuleInit() {
    if (this.bindings.length === 0) {
      return;
    }

    const url = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
    this.connection = connect([url]);

    this.channel = this.connection.createChannel({
      setup: async (ch: ConfirmChannel) => {
        for (const binding of this.bindings) {
          const topology = getRabbitMQQueueTopology(binding.queue);

          await ch.assertExchange(topology.deadLetterExchange, 'direct', { durable: true });
          await ch.assertQueue(topology.deadLetterQueue, { durable: true });
          await ch.bindQueue(
            topology.deadLetterQueue,
            topology.deadLetterExchange,
            topology.deadLetterRoutingKey
          );
          await ch.assertQueue(
            binding.queue,
            getRabbitMQQueueOptions(binding.queue, binding.maxDeliveries)
          );

          if (binding.exchange) {
            await ch.assertExchange(binding.exchange, 'fanout', { durable: true });
            await ch.bindQueue(binding.queue, binding.exchange, '');
            this.logger.log(
              `Bound queue "${binding.queue}" to fanout exchange "${binding.exchange}"`
            );
            continue;
          }

          this.logger.log(`Configured queue "${binding.queue}" with dead-letter routing`);
        }
      },
    });

    await this.channel.waitForConnect();
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }
}
