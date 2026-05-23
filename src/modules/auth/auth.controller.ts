import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';

import { AuthService } from './auth.service';
import { ResetPasswordService } from './services/reset-password.service';
import { SignUpDto } from './dto/sign-up.dto';
import { SignInDto } from './dto/sign-in.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { CurrentUser, Public } from '../../common/decorators';
import { User } from '../users/entities/user.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly resetPasswordService: ResetPasswordService,
  ) {}

  @Post('signup')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  signUp(@Body() dto: SignUpDto) {
    return this.authService.signUp(dto);
  }

  @Post('signin')
  @Public()
  @HttpCode(HttpStatus.OK)
  signIn(@Body() dto: SignInDto) {
    return this.authService.signIn(dto);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  /**
   * Logout current device only.
   * Extracts the raw JWT from the Authorization header so it can be blacklisted.
   * FIX: was passing user.id (string) to a method that expected a JWT string.
   */
  @Post('logout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  logout(@Req() req: Request) {
    const token = this.extractBearerToken(req);
    return this.authService.logout(token);
  }

  /**
   * Logout all devices.
   * Bumps tokenVersion to invalidate all existing JWTs, and also blacklists
   * the current access token so it cannot be reused within its remaining TTL.
   */
  @Post('logout-all')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  logoutAll(@CurrentUser() user: User, @Req() req: Request) {
    const token = this.extractBearerToken(req);
    return this.authService.logoutAll(user.id, token);
  }

  /* =====================================================
      RESET PASSWORD
  ===================================================== */

  @Post('reset/send-code')
  @Public()
  @HttpCode(HttpStatus.OK)
  sendResetCode(@Body('email') email: string) {
    return this.resetPasswordService.sendResetCode(email);
  }

  @Post('reset/verify')
  @Public()
  @HttpCode(HttpStatus.OK)
  verifyResetCode(@Body('email') email: string, @Body('code') code: string) {
    return this.resetPasswordService.verifyResetCode(email, code);
  }

  @Post('reset/change-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  changePassword(
    @Body('email') email: string,
    @Body('newPassword') newPassword: string,
  ) {
    return this.resetPasswordService.changePassword(email, newPassword);
  }

  /* =====================================================
      HELPERS
  ===================================================== */

  private extractBearerToken(req: Request): string {
    return req.headers.authorization?.split(' ')[1] ?? '';
  }
}
