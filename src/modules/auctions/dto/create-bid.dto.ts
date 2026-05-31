import { IsUUID, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class PlaceBidDto {
  @ApiProperty({ description: 'Product (auction) ID' })
  @IsUUID()
  productId: string;

  @ApiProperty({ description: 'Bid amount — must exceed current highest bid' })
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  amount: number;
}
