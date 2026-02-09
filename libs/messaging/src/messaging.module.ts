import { DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxEvent, ProcessedEvent } from '@app/database';
import { OutboxPublisher } from './outbox-publisher';
import { OutboxPublisherWorker } from './outbox-publisher-worker';
import { ProcessedEventRepository } from './processed-event.repository';

type MessagingModuleOptions = {
  clientToken: string;
  patternTransformer: (eventType: string) => string;
};

@Module({})
export class MessagingModule {
  static forProducer({ clientToken, patternTransformer }: MessagingModuleOptions): DynamicModule {
    return {
      module: MessagingModule,
      imports: [TypeOrmModule.forFeature([OutboxEvent])],
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
