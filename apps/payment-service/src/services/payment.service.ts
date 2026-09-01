import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Payment, PaymentAttempt, PaymentStatus } from '../entities';
import { OutboxEvent } from '@app/database';
import { PaymentRepository } from '../repositories/payment.repository';
import { v4 as uuid } from 'uuid';

type PaymentProviderRequest = {
  amount: number;
  currency: string;
};

type ProcessPaymentOptions = {
  orderId: string;
  amount: number;
  currency: string;
};

type PaymentTransactionOptions = {
  orderId: string;
  amount: number;
  currency: string;
  manager: EntityManager;
};

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly dataSource: DataSource
  ) {}

  async processPayment({ orderId, amount, currency }: ProcessPaymentOptions) {
    const queryRunner = this.dataSource.createQueryRunner();
    let transactionStarted = false;

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
      transactionStarted = true;
      const result = await this.processPaymentInTransaction({
        orderId,
        amount,
        currency,
        manager: queryRunner.manager,
      });
      await queryRunner.commitTransaction();

      return result;
    } catch (error) {
      if (transactionStarted) {
        await queryRunner.rollbackTransaction();
      }
      this.logger.error(`Error processing payment for order ${orderId}:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getPaymentByOrderId(orderId: string) {
    const payment = await this.paymentRepository.findByOrderId({ orderId });
    if (!payment) {
      return null;
    }
    return this.mapToDto(payment);
  }

  async processPaymentInTransaction({
    orderId,
    amount,
    currency,
    manager,
  }: PaymentTransactionOptions) {
    const existingPayment = await this.paymentRepository.findByOrderId({
      orderId,
      manager,
    });

    let finalPayment: Payment;

    if (existingPayment) {
      this.logger.warn(`Payment already exists for order ${orderId}`);
      finalPayment = existingPayment;
    } else {
      const payment = manager.create(Payment, {
        id: uuid(),
        orderId,
        amount,
        currency,
        status: PaymentStatus.PROCESSING,
      });

      const savedPayment = await manager.save(payment);

      const paymentResult = await this.callPaymentProvider({ amount, currency });

      const updatedPayment = { ...savedPayment };
      if (paymentResult.success) {
        updatedPayment.status = PaymentStatus.COMPLETED;
        updatedPayment.externalPaymentId = paymentResult.transactionId;
      } else {
        updatedPayment.status = PaymentStatus.FAILED;
      }

      const paymentUpdate = manager.create(Payment, updatedPayment);
      finalPayment = await manager.save(paymentUpdate);

      const outboxEvent = manager.create(OutboxEvent, {
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

      await manager.save(outboxEvent);

      if (!paymentResult.success) {
        const attempt = manager.create(PaymentAttempt, {
          id: uuid(),
          paymentId: finalPayment.id,
          attemptNumber: 1,
          errorMessage: paymentResult.error,
        });
        await manager.save(attempt);
      }
    }

    return this.mapToDto(finalPayment);
  }

  private async callPaymentProvider({ amount, currency }: PaymentProviderRequest) {
    const pollCount = 3;
    const jitter = (amount % 100) + currency.length;

    for (let attempt = 1; attempt <= pollCount; attempt += 1) {
      await this.wait(250 + attempt * 150 + (jitter % 50));
      const random = Math.random();

      if (random > 0.7) {
        return {
          success: true,
          transactionId: `txn_${uuid()}`,
        };
      }
    }

    return {
      success: false,
      error: 'Payment provider temporarily unavailable',
    };
  }

  private wait(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  private mapToDto(payment: Payment) {
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
