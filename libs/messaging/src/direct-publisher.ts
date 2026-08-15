import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy, RmqRecordBuilder } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class DirectPublisher {
  constructor(
    @Inject('DIRECT_CLIENT')
    private readonly client: ClientProxy
  ) {}

  async publish(pattern: string, message: Record<string, any>) {
    const messageId = typeof message.id === 'string' ? message.id : undefined;
    const payload = messageId
      ? new RmqRecordBuilder(message)
          .setOptions({ persistent: true, messageId })
          .build()
      : new RmqRecordBuilder(message).setOptions({ persistent: true }).build();

    await lastValueFrom(this.client.emit(pattern, payload), { defaultValue: undefined });
  }
}
