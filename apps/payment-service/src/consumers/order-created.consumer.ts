import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { PaymentService } from '../services/payment.service';
import { ProcessedEventRepository } from '@app/messaging';

@Controller()
export class OrderCreatedConsumer {
  private readonly logger = new Logger(OrderCreatedConsumer.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly processedEventRepository: ProcessedEventRepository
  ) {}

  @EventPattern('order.created')
  async handleOrderCreated(
    @Payload()
    message: {
      id: string;
      orderId: string;
      userId: string;
      totalAmount: number;
      currency: string;
      items: Array<{
        productId: string;
        quantity: number;
        unitPrice: number;
      }>;
    }
  ) {
    try {
      const consumerId = 'payment-service';
      const processed = await this.processedEventRepository.findProcessedEvent(
        message.id,
        consumerId
      );

      if (processed) {
        this.logger.warn(`Event ${message.id} already processed by ${consumerId}`);
        return;
      }

      this.logger.log(`Processing OrderCreated event for order ${message.orderId}`);

      await this.paymentService.processPayment(
        message.orderId,
        message.totalAmount,
        message.currency
      );

      await this.processedEventRepository.markAsProcessed(message.id, consumerId);

      this.logger.log(`Successfully processed OrderCreated event for order ${message.orderId}`);
    } catch (error) {
      this.logger.error(`Error processing OrderCreated event:`, error);
    }
  }
}
