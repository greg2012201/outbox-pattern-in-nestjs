import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { NotificationService } from '../services/notification.service';
import { ProcessedEventRepository } from '../repositories/processed-event.repository';

@Controller()
export class PaymentCompletedConsumer {
  private readonly logger = new Logger(PaymentCompletedConsumer.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly processedEventRepository: ProcessedEventRepository
  ) {}

  @MessagePattern('payment.paymentcompleted')
  async handlePaymentCompleted(
    @Payload()
    message: {
      id: string;
      paymentId: string;
      orderId: string;
      amount: number;
      currency: string;
      transactionId: string;
    }
  ) {
    try {
      const consumerId = 'notification-service';
      const processed = await this.processedEventRepository.findProcessedEvent(
        message.id,
        consumerId
      );

      if (processed) {
        this.logger.warn(`Event ${message.id} already processed by ${consumerId}`);
        return;
      }

      this.logger.log(`Processing PaymentCompleted event for order ${message.orderId}`);

      await this.notificationService.sendNotification({
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
      throw error;
    }
  }
}
