import { DynamicModule, Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxEvent, ProcessedEvent } from '@app/database';
import { OutboxPublisher } from './outbox-publisher';
import { OutboxPublisherWorker } from './outbox-publisher-worker';
import { DirectPublisher } from './direct-publisher';
import { FanoutPublisher } from './fanout-publisher';
import { QueueBindingService } from './queue-binding.service';
import { ProcessedEventRepository } from './processed-event.repository';
import { getRabbitMQConfig } from './rabbitmq-config';

type DirectProducerOptions = {
  clientToken: string;
  queue: string;
  patternTransformer: (eventType: string) => string;
};

type FanoutProducerOptions = {
  exchange: string;
  patternTransformer: (eventType: string) => string;
};

type QueueBinding = {
  exchange: string;
  queue: string;
};

type ConsumerOptions = {
  bindings?: QueueBinding[];
};

@Module({})
export class MessagingModule {
  static forDirectProducer({
    clientToken,
    queue,
    patternTransformer,
  }: DirectProducerOptions): DynamicModule {
    return {
      module: MessagingModule,
      imports: [
        TypeOrmModule.forFeature([OutboxEvent]),
        ClientsModule.register([
          {
            name: clientToken,
            ...getRabbitMQConfig({ queue, noAck: true }),
          },
        ]),
      ],
      providers: [
        OutboxPublisher,
        OutboxPublisherWorker,
        {
          provide: 'DIRECT_CLIENT',
          useExisting: clientToken,
        },
        DirectPublisher,
        {
          provide: 'OUTBOX_MESSAGE_PUBLISHER',
          useExisting: DirectPublisher,
        },
        {
          provide: 'OUTBOX_EVENT_PATTERN_TRANSFORMER',
          useValue: patternTransformer,
        },
      ],
      exports: [OutboxPublisher, OutboxPublisherWorker],
    };
  }

  static forFanoutProducer({ exchange, patternTransformer }: FanoutProducerOptions): DynamicModule {
    return {
      module: MessagingModule,
      imports: [TypeOrmModule.forFeature([OutboxEvent])],
      providers: [
        OutboxPublisher,
        OutboxPublisherWorker,
        FanoutPublisher,
        {
          provide: 'FANOUT_EXCHANGE_NAME',
          useValue: exchange,
        },
        {
          provide: 'OUTBOX_MESSAGE_PUBLISHER',
          useExisting: FanoutPublisher,
        },
        {
          provide: 'OUTBOX_EVENT_PATTERN_TRANSFORMER',
          useValue: patternTransformer,
        },
      ],
      exports: [OutboxPublisher, OutboxPublisherWorker],
    };
  }

  static forConsumer(options?: ConsumerOptions): DynamicModule {
    const bindings = options?.bindings ?? [];

    return {
      module: MessagingModule,
      imports: [TypeOrmModule.forFeature([ProcessedEvent])],
      providers: [
        ProcessedEventRepository,
        QueueBindingService,
        {
          provide: 'QUEUE_BINDINGS',
          useValue: bindings,
        },
      ],
      exports: [ProcessedEventRepository],
    };
  }
}
