import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Payment, PaymentAttempt, OutboxEvent, PaymentStatus } from '@app/database/entities';
import { PaymentDto } from '../dto/payment.dto';
import { PaymentRepository } from '../repositories/payment.repository';
import { PaymentAttemptRepository } from '../repositories/payment-attempt.repository';
import { OutboxRepository } from '../repositories/outbox.repository';
import { ProcessedEventRepository } from '../repositories/processed-event.repository';
import { v4 as uuid } from 'uuid';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly paymentAttemptRepository: PaymentAttemptRepository,
    private readonly outboxRepository: OutboxRepository,
    private readonly processedEventRepository: ProcessedEventRepository,
    @InjectRepository(Payment)
    private paymentsRepository: Repository<Payment>,
    @InjectRepository(PaymentAttempt)
    private paymentAttemptsRepository: Repository<PaymentAttempt>,
    @InjectRepository(OutboxEvent)
    private outboxEventRepository: Repository<OutboxEvent>,
    private dataSource: DataSource
  ) {}

  async processPayment(orderId: string, amount: number, currency: string): Promise<PaymentDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const existingPayment = await this.paymentRepository.findByOrderId(orderId);
      if (existingPayment) {
        this.logger.warn(`Payment already exists for order ${orderId}`);
        return this.mapToDto(existingPayment);
      }

      const payment = queryRunner.manager.create(Payment, {
        id: uuid(),
        orderId,
        amount,
        currency,
        status: PaymentStatus.PROCESSING,
      });

      const savedPayment = await queryRunner.manager.save(payment);

      const paymentResult = await this.callPaymentProvider(amount, currency);

      const updatedPayment = { ...savedPayment };
      if (paymentResult.success) {
        updatedPayment.status = PaymentStatus.COMPLETED;
        updatedPayment.externalPaymentId = paymentResult.transactionId;
      } else {
        updatedPayment.status = PaymentStatus.FAILED;
      }

      const paymentUpdate = queryRunner.manager.create(Payment, updatedPayment);
      const finalPayment = await queryRunner.manager.save(paymentUpdate);

      const outboxEvent = queryRunner.manager.create(OutboxEvent, {
        id: uuid(),
        aggregateType: 'Payment',
        aggregateId: finalPayment.id,
        eventType: paymentResult.success ? 'PaymentCompleted' : 'PaymentFailed',
        payload: paymentResult.success
          ? {
              paymentId: finalPayment.id,
              orderId: finalPayment.orderId,
              amount: finalPayment.amount,
              currency: finalPayment.currency,
              transactionId: paymentResult.transactionId,
            }
          : {
              paymentId: finalPayment.id,
              orderId: finalPayment.orderId,
              reason: paymentResult.error,
            },
      });

      await queryRunner.manager.save(outboxEvent);

      if (!paymentResult.success) {
        const attempt = queryRunner.manager.create(PaymentAttempt, {
          id: uuid(),
          paymentId: finalPayment.id,
          attemptNumber: 1,
          errorMessage: paymentResult.error,
        });
        await queryRunner.manager.save(attempt);
      }

      await queryRunner.commitTransaction();

      return this.mapToDto(finalPayment);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Error processing payment for order ${orderId}:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getPaymentByOrderId(orderId: string): Promise<PaymentDto | null> {
    const payment = await this.paymentRepository.findByOrderId(orderId);
    if (!payment) {
      return null;
    }
    return this.mapToDto(payment);
  }

  private async callPaymentProvider(
    amount: number,
    currency: string
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    const random = Math.random();
    if (random > 0.1) {
      return {
        success: true,
        transactionId: `txn_${uuid()}`,
      };
    } else {
      return {
        success: false,
        error: 'Payment provider temporarily unavailable',
      };
    }
  }

  private mapToDto(payment: Payment): PaymentDto {
    return {
      id: payment.id,
      orderId: payment.orderId,
      amount: Number(payment.amount),
      currency: payment.currency,
      status: payment.status,
      externalPaymentId: payment.externalPaymentId,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }
}
