import { IsEmail, MaxLength, MinLength } from 'class-validator';

// Replace loose @Body() params with a proper DTO:
export class ChangePasswordDto {
  @IsEmail()
  email: string;
  @MaxLength(72)
  @MinLength(6)
  newPassword: string;
}
