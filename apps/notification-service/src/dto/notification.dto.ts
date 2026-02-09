export class NotificationDto {
  id: string;
  orderId: string;
  eventId: string;
  type: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  sentAt?: Date;
}
