import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { InboxMessageProcessor, RmqMessageDeliveryFactory } from '@app/messaging';
import {
  PaymentCompletedEmailHandler,
  PaymentCompletedMessage,
} from '../handlers/payment-completed.handler';

@Controller()
export class PaymentCompletedConsumer {
  constructor(
    private readonly inboxMessageProcessor: InboxMessageProcessor,
    private readonly paymentCompletedHandler: PaymentCompletedEmailHandler,
    private readonly rmqMessageDeliveryFactory: RmqMessageDeliveryFactory
  ) {}

  @EventPattern('payment.paymentcompleted')
  handlePaymentCompleted(@Payload() message: PaymentCompletedMessage, @Ctx() context: RmqContext) {
    return this.inboxMessageProcessor.process({
      message,
      handler: this.paymentCompletedHandler,
      delivery: this.rmqMessageDeliveryFactory.create(context),
    });
  }
}
