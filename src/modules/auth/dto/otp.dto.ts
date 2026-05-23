import {
  IsString,
  IsMobilePhone,
  IsEnum,
  IsOptional,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from 'src/common/enums/role.enum';

export class SendOtpDto {
  @ApiProperty({ example: '+972591234567' })
  @IsString()
  @IsMobilePhone()
  phone: string;

  @ApiPropertyOptional({ enum: Role, default: Role.BUYER })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ example: 'Ahmed Al-Nabulsi' })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  fullName?: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '+972591234567' })
  @IsString()
  @IsMobilePhone()
  phone: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(4, 8)
  code: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}
