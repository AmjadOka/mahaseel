import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsDateString,
  ValidateIf,
  Min,
  IsUUID,
  IsInt,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

import { Type } from 'class-transformer';

import { SaleMethod, Unit } from '../../../common/enums/Unit.enum.js';

import { DeliveryMethod } from '../../../common/enums/delivery.enum.js';

export class CreateProductDto {
  @ApiProperty()
  @IsUUID()
  farmId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  quantity: number;

  @ApiProperty({ enum: Unit })
  @IsEnum(Unit)
  unit: Unit;

  @ApiProperty({ enum: SaleMethod })
  @IsEnum(SaleMethod)
  saleMethod: SaleMethod;

  /**
   * FIXED PRICE
   */
  @ApiPropertyOptional()
  @ValidateIf((o) => o.saleMethod === SaleMethod.FIXED)
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  fixedPrice?: number;

  /**
   * AUCTION START PRICE
   */
  @ApiPropertyOptional()
  @ValidateIf((o) => o.saleMethod === SaleMethod.AUCTION)
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  auctionStartPrice?: number;

  /**
   * AUCTION END DATE
   */
  @ApiPropertyOptional()
  @ValidateIf((o) => o.saleMethod === SaleMethod.AUCTION)
  @IsDateString()
  auctionEndAt?: string;

  /**
   * AUCTION DURATION
   * Needed for relisting auctions correctly
   */
  @ApiPropertyOptional({
    example: 24,
    description: 'Auction duration in hours',
  })
  @ValidateIf((o) => o.saleMethod === SaleMethod.AUCTION)
  @IsInt()
  @Min(1)
  @Type(() => Number)
  auctionDurationHours?: number;

  @ApiProperty({ enum: DeliveryMethod })
  @IsEnum(DeliveryMethod)
  deliveryMethod: DeliveryMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  driverName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  driverPhone?: string;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class FilterMarketDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    enum: SaleMethod,
  })
  @IsOptional()
  @IsEnum(SaleMethod)
  saleMethod?: SaleMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  priceMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  priceMax?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({
    enum: Unit,
  })
  @IsOptional()
  @IsEnum(Unit)
  unit?: Unit;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;
}
