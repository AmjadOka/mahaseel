import {
  IsString,
  IsOptional,
  IsNumber,
  Length,
  IsMobilePhone,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateFarmDto {
  @ApiProperty() @IsString() @Length(2, 150) name: string;
  @ApiProperty() @IsString() @Length(2, 150) displayName: string;
  @ApiProperty() @IsString() @Length(2, 100) managerName: string;
  @ApiProperty() @IsString() @IsMobilePhone() contactPhone: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() latitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() longitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() locationText?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() agRegistryNo?: string;
}

export class UpdateFarmDto extends PartialType(CreateFarmDto) {}
