import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FlagReason, FlagStatus } from '../entities/rating.entity';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class FlagRatingDto {
  @ApiProperty({ enum: FlagReason })
  @IsEnum(FlagReason)
  reason: FlagReason;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class ReviewFlagDto {
  @ApiProperty({
    enum: [FlagStatus.REVIEWED, FlagStatus.DISMISSED, FlagStatus.REMOVED],
  })
  @IsEnum(FlagStatus)
  status: FlagStatus.REVIEWED | FlagStatus.DISMISSED | FlagStatus.REMOVED;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  adminNotes?: string;
}

export class UpdateRatingDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  score?: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
