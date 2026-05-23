import { IsUUID, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class PlaceBidDto {
  @ApiProperty({ description: 'Product (auction) ID' })
  @IsUUID()
  productId: string;

  @ApiProperty({ description: 'Bid amount — must exceed current highest bid' })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount: number;
}

export class AcceptBidDto {
  @ApiProperty({ description: 'Bid ID to accept (merchant only)' })
  @IsUUID()
  bidId: string;
}
