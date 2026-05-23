import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { Platform } from '../../../common/enums/platform.enum';

export class RegisterFcmDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsEnum(Platform)
  platform: Platform;
}
