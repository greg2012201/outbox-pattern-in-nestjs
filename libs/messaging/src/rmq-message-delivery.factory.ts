import { Injectable } from '@nestjs/common';
import { RmqContext } from '@nestjs/microservices';
import { InboxMessageDelivery } from './inbox-message-processor';

@Injectable()
export class RmqMessageDeliveryFactory {
  create(context: RmqContext): InboxMessageDelivery {
    const channel = context.getChannelRef();
    const originalMessage = context.getMessage();

    return {
      ack: () => channel.ack(originalMessage),
      nack: (requeue) => channel.nack(originalMessage, false, requeue),
    };
  }
}
