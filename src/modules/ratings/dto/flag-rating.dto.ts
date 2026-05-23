import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FlagReason, FlagStatus } from '../entities/rating.entity';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  adminNotes?: string;
}
