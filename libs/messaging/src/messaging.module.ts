import { DynamicModule, Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxEvent, ProcessedEvent } from '@app/database';
import { OutboxPublisher } from './outbox-publisher';
import { OutboxPublisherWorker } from './outbox-publisher-worker';
import { ProcessedEventRepository } from './processed-event.repository';
import { getRabbitMQConfig } from './rabbitmq-config';

type MessagingModuleOptions = {
  clientToken: string;
  queue: string;
  patternTransformer: (eventType: string) => string;
};

@Module({})
export class MessagingModule {
  static forProducer({
    clientToken,
    queue,
    patternTransformer,
  }: MessagingModuleOptions): DynamicModule {
    return {
      module: MessagingModule,
      imports: [
        TypeOrmModule.forFeature([OutboxEvent]),
        ClientsModule.register([
          {
            name: clientToken,
            ...getRabbitMQConfig(queue),
          },
        ]),
      ],
      providers: [
        OutboxPublisher,
        OutboxPublisherWorker,
        {
          provide: 'OUTBOX_CLIENT',
          useExisting: clientToken,
        },
        {
          provide: 'OUTBOX_EVENT_PATTERN_TRANSFORMER',
          useValue: patternTransformer,
        },
      ],
      exports: [OutboxPublisher, OutboxPublisherWorker],
    };
  }

  static forConsumer(): DynamicModule {
    return {
      module: MessagingModule,
      imports: [TypeOrmModule.forFeature([ProcessedEvent])],
      providers: [ProcessedEventRepository],
      exports: [ProcessedEventRepository],
    };
  }
}
