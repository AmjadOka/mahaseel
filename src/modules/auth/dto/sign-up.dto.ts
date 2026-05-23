import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsMobilePhone, IsString, MinLength } from 'class-validator';

export class SignUpDto {
  @IsString()
  fullName: string;

  @IsEmail()
  email: string;

  @MinLength(6)
  password: string;

  @ApiProperty({ example: '+972591234567' })
  @IsString()
  @IsMobilePhone()
  phone: string;
}
