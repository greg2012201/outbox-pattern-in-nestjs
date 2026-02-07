import { IsString, IsNumber, IsArray, ValidateNested, IsPositive, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOrderItemDto {
  @IsString()
  productId: string;

  @IsNumber()
  @IsPositive()
  quantity: number;

  @IsNumber()
  @IsPositive()
  unitPrice: number;
}

export class CreateOrderDto {
  @IsString()
  userId: string;

  @IsNumber()
  @IsPositive()
  totalAmount: number;

  @IsIn(['USD', 'EUR', 'GBP'])
  currency: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}
