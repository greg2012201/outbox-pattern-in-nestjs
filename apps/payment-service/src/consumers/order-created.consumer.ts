import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { InboxMessageProcessor, RmqMessageDeliveryFactory } from '@app/messaging';
import { OrderCreatedHandler, OrderCreatedMessage } from '../handlers/order-created.handler';

@Controller()
export class OrderCreatedConsumer {
  constructor(
    private readonly inboxMessageProcessor: InboxMessageProcessor,
    private readonly orderCreatedHandler: OrderCreatedHandler,
    private readonly rmqMessageDeliveryFactory: RmqMessageDeliveryFactory
  ) {}

  @EventPattern('order.created')
  handleOrderCreated(@Payload() message: OrderCreatedMessage, @Ctx() context: RmqContext) {
    return this.inboxMessageProcessor.process({
      message,
      handler: this.orderCreatedHandler,
      delivery: this.rmqMessageDeliveryFactory.create(context),
    });
  }
}
