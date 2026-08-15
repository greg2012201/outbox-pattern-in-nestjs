import { Injectable, Logger, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { connect, AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import { ConfirmChannel } from 'amqplib';

@Injectable()
export class FanoutPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FanoutPublisher.name);
  private connection: AmqpConnectionManager;
  private channel: ChannelWrapper;

  constructor(
    @Inject('FANOUT_EXCHANGE_NAME')
    private readonly exchangeName: string
  ) {}

  async onModuleInit() {
    const url = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
    this.connection = connect([url]);

    this.channel = this.connection.createChannel({
      setup: async (ch: ConfirmChannel) => {
        await ch.assertExchange(this.exchangeName, 'fanout', { durable: true });
        this.logger.log(`Asserted fanout exchange "${this.exchangeName}"`);
      },
    });
  }

  async publish(pattern: string, message: Record<string, any>) {
    const payload = Buffer.from(JSON.stringify({ pattern, data: message }));
    const messageId = typeof message.id === 'string' ? message.id : undefined;
    const publishOptions = messageId
      ? { persistent: true, messageId }
      : { persistent: true };

    await this.channel.publish(
      this.exchangeName,
      '',
      payload,
      publishOptions as Parameters<ChannelWrapper['publish']>[3]
    );

    this.logger.log(
      `Published to fanout exchange "${this.exchangeName}" with pattern "${pattern}"`
    );
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }
}
