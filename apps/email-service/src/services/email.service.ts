import { Injectable, Logger } from '@nestjs/common';
import { Email, EmailStatus } from '@app/database/entities';
import { EmailRepository } from '../repositories/email.repository';
import { EmailDto } from '../dto/email.dto';
import { v4 as uuid } from 'uuid';

type SendEmailParams = {
  orderId: string;
  eventId: string;
  paymentId: string;
  amount: number;
  currency: string;
  transactionId: string;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly emailRepository: EmailRepository) {}

  async sendConfirmationEmail({
    orderId,
    eventId,
    paymentId,
    amount,
    currency,
    transactionId,
  }: SendEmailParams): Promise<EmailDto> {
    const existingEmail = await this.emailRepository.findByEventId(eventId);
    if (existingEmail) {
      this.logger.warn(`Email already exists for event ${eventId}`);
      return this.mapToDto(existingEmail);
    }

    const subject = this.renderSubject({ orderId, amount, currency });
    const recipientEmail = this.resolveRecipientEmail(orderId);

    const email = await this.emailRepository.create({
      id: uuid(),
      orderId,
      eventId,
      recipientEmail,
      subject,
      status: EmailStatus.PENDING,
    });

    try {
      await this.sendEmail({
        recipientEmail,
        subject,
        orderId,
        paymentId,
        amount,
        currency,
        transactionId,
      });

      const updatedEmail = await this.emailRepository.update(email.id, {
        status: EmailStatus.SENT,
        sentAt: new Date(),
      });

      this.logger.log(`Confirmation email sent for order ${orderId} to ${recipientEmail}`);

      return this.mapToDto(updatedEmail!);
    } catch (error) {
      await this.emailRepository.update(email.id, {
        status: EmailStatus.FAILED,
      });

      this.logger.error(`Failed to send confirmation email for order ${orderId}:`, error);
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

  private mapToDto(email: Email): EmailDto {
    return {
      id: email.id,
      orderId: email.orderId,
      eventId: email.eventId,
      recipientEmail: email.recipientEmail,
      subject: email.subject,
      status: email.status,
      createdAt: email.createdAt,
      updatedAt: email.updatedAt,
      sentAt: email.sentAt,
    };
  }
}
