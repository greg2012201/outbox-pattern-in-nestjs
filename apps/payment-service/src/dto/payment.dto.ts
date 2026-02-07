export class PaymentDto {
  id: string;
  orderId: string;
  amount: number;
  currency: string;
  status: string;
  externalPaymentId?: string;
  createdAt: Date;
  updatedAt: Date;
}
