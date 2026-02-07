export class OrderItemDto {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
}

export class OrderDto {
  id: string;
  userId: string;
  totalAmount: number;
  currency: string;
  status: string;
  items: OrderItemDto[];
  createdAt: Date;
  updatedAt: Date;
}
