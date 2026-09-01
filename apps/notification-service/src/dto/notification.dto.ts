export class NotificationDto {
  id: string;
  orderId: string;
  type: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  sentAt?: Date;
}
