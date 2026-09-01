import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Email, EmailStatus } from '../entities';
import { EmailRepository } from '../repositories/email.repository';
import { v4 as uuid } from 'uuid';

type EmailWorkItemParams = {
  manager: EntityManager;
  orderId: string;
  paymentId: string;
  amount: number;
  currency: string;
  transactionId: string;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly emailRepository: EmailRepository) {}

  async createPendingEmail({
    manager,
    orderId,
    paymentId,
    amount,
    currency,
    transactionId,
  }: EmailWorkItemParams) {
    const subject = this.renderSubject({ orderId, amount, currency });
    const recipientEmail = this.resolveRecipientEmail(orderId);

    const email = await this.emailRepository.saveEmail({
      manager,
      data: {
        id: uuid(),
        orderId,
        paymentId,
        amount,
        currency,
        transactionId,
        recipientEmail,
        subject,
        status: EmailStatus.PENDING,
      },
    });

    return this.mapToDto(email);
  }

  async deliverEmail(emailId: string) {
    const email = await this.emailRepository.findById(emailId);
    if (!email) {
      throw new Error(`Email ${emailId} not found`);
    }

    if (email.status === EmailStatus.SENT) {
      return this.mapToDto(email);
    }

    try {
      await this.sendEmail({
        recipientEmail: email.recipientEmail,
        subject: email.subject,
        orderId: email.orderId,
        paymentId: email.paymentId,
        amount: email.amount,
        currency: email.currency,
        transactionId: email.transactionId,
      });

      const updatedEmail = await this.emailRepository.update(email.id, {
        status: EmailStatus.SENT,
        sentAt: new Date(),
      });

      this.logger.log(
        `Confirmation email sent for order ${email.orderId} to ${email.recipientEmail}`
      );

      return this.mapToDto(updatedEmail!);
    } catch (error) {
      await this.emailRepository.update(email.id, {
        status: EmailStatus.FAILED,
      });

      this.logger.error(`Failed to send confirmation email for order ${email.orderId}:`, error);
      throw error;
    }
  }

  private renderSubject({
    orderId,
    amount,
    currency,
  }: {
    orderId: string;
    amount: number;
    currency: string;
  }) {
    return `Payment Confirmation - Order ${orderId} - ${amount} ${currency}`;
  }

  private resolveRecipientEmail(orderId: string) {
    return `customer-${orderId}@example.com`;
  }

  private async sendEmail(data: {
    recipientEmail: string;
    subject: string;
    orderId: string;
    paymentId: string;
    amount: number;
    currency: string;
    transactionId: string;
  }) {
    const body = this.renderTemplate(data);
    this.logger.log(`[MOCK] Sending email to ${data.recipientEmail}`);
    this.logger.log(`[MOCK] Subject: ${data.subject}`);
    this.logger.log(`[MOCK] Body: ${body}`);
  }

  private renderTemplate(data: {
    orderId: string;
    paymentId: string;
    amount: number;
    currency: string;
    transactionId: string;
  }) {
    return [
      `Dear Customer,`,
      ``,
      `Your payment has been successfully processed.`,
      ``,
      `Order ID: ${data.orderId}`,
      `Payment ID: ${data.paymentId}`,
      `Amount: ${data.amount} ${data.currency}`,
      `Transaction ID: ${data.transactionId}`,
      ``,
      `Thank you for your purchase!`,
    ].join('\n');
  }

  private mapToDto(email: Email) {
    return {
      id: email.id,
      orderId: email.orderId,
      recipientEmail: email.recipientEmail,
      subject: email.subject,
      status: email.status,
      createdAt: email.createdAt,
      updatedAt: email.updatedAt,
      sentAt: email.sentAt,
    };
  }
}
