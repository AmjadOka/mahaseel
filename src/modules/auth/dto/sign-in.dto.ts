import { IsEmail, MaxLength, MinLength } from 'class-validator';

export class SignInDto {
  @IsEmail()
  email: string;
  @MaxLength(72)
  @MinLength(6)
  password: string;
}
