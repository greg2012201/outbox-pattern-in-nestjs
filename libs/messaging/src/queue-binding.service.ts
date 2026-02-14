import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { connect, AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import { ConfirmChannel } from 'amqplib';

type QueueBinding = {
  exchange: string;
  queue: string;
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
          await ch.assertExchange(binding.exchange, 'fanout', { durable: true });
          await ch.assertQueue(binding.queue, { durable: true });
          await ch.bindQueue(binding.queue, binding.exchange, '');
          this.logger.log(
            `Bound queue "${binding.queue}" to fanout exchange "${binding.exchange}"`
          );
        }
      },
    });
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }
}
