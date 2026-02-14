import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { EmailService } from '../services/email.service';
import { ProcessedEventRepository, PaymentCompletedEvent } from '@app/messaging';

@Controller()
export class PaymentCompletedConsumer {
  private readonly logger = new Logger(PaymentCompletedConsumer.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly processedEventRepository: ProcessedEventRepository
  ) {}

  @EventPattern('payment.paymentcompleted')
  async handlePaymentCompleted(
    @Payload()
    message: PaymentCompletedEvent & { id: string }
  ) {
    try {
      const consumerId = 'email-service';
      const processed = await this.processedEventRepository.findProcessedEvent(
        message.id,
        consumerId
      );

      if (processed) {
        this.logger.warn(`Event ${message.id} already processed by ${consumerId}`);
        return;
      }

      this.logger.log(`Processing PaymentCompleted event for order ${message.orderId}`);

      await this.emailService.sendConfirmationEmail({
        orderId: message.orderId,
        eventId: message.id,
        paymentId: message.paymentId,
        amount: message.amount,
        currency: message.currency,
        transactionId: message.transactionId,
      });

      await this.processedEventRepository.markAsProcessed(message.id, consumerId);

      this.logger.log(`Successfully processed PaymentCompleted event for order ${message.orderId}`);
    } catch (error) {
      this.logger.error(`Error processing PaymentCompleted event:`, error);
    }
  }
}
