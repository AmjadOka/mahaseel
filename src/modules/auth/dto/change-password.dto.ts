import { IsEmail, MinLength } from 'class-validator';

// Replace loose @Body() params with a proper DTO:
export class ChangePasswordDto {
  @IsEmail()
  email: string;
  @MinLength(6)
  newPassword: string;
}
