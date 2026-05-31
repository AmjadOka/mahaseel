import {
  IsUUID,
  IsNumber,
  IsEnum,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { DeliveryStatus } from 'src/common/enums/order-status.enum';

export class CreateOrderDto {
  @ApiProperty() @IsUUID() productId: string;
  @ApiProperty() @IsNumber() @Min(1) @Type(() => Number) offeredPrice: number;
  @ApiProperty() @IsNumber() @Min(0.001) @Type(() => Number) quantity: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: DeliveryStatus })
  @IsEnum(DeliveryStatus)
  status: DeliveryStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class RejectOrderDto {
  @IsString()
  @MaxLength(500)
  reason: string;
}
