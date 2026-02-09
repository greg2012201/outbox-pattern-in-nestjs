export class EmailDto {
  id: string;
  orderId: string;
  eventId: string;
  recipientEmail: string;
  subject: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  sentAt?: Date;
}
