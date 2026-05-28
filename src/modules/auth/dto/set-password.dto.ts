import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetPasswordDto {
  @ApiProperty({ example: 'MyStr0ngP@ss' })
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  newPassword: string;
}
