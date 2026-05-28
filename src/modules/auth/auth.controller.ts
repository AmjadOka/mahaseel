import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { AuthService } from './auth.service';
import { ResetPasswordService } from './services/reset-password.service';
import { SignUpDto } from './dto/sign-up.dto';
import { SignInDto } from './dto/sign-in.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { CurrentUser, Public } from '../../common/decorators';
import { User } from '../users/entities/user.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GoogleAuthGuard } from 'src/common/guards/google-auth-guard';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Throttle } from '@nestjs/throttler';
import { SetPasswordDto } from './dto/set-password.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly resetPasswordService: ResetPasswordService,
  ) {}

  /* =====================================================
      EMAIL / PASSWORD
  ===================================================== */

  @Post('signup')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({
    default: {
      limit: 3,
      ttl: 180_000,
    },
  })
  signUp(@Body() dto: SignUpDto) {
    return this.authService.signUp(dto);
  }

  @Post('verify-email')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 3,
      ttl: 180_000,
    },
  })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.email, dto.code);
  }

  @Post('resend-verification')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 3,
      ttl: 180_000,
    },
  })
  resendVerification(@Body('email') email: string) {
    return this.authService.resendVerificationCode(email);
  }

  @Post('signin')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 3,
      ttl: 180_000,
    },
  })
  signIn(@Body() dto: SignInDto) {
    return this.authService.signIn(dto);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 3,
      ttl: 180_000,
    },
  })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  /* =====================================================
      GOOGLE OAUTH
  ===================================================== */

  /**
   * GET /auth/google
   * Redirects the browser to Google's consent screen.
   */
  @Get('google')
  @Public()
  @UseGuards(GoogleAuthGuard)
  @Throttle({
    default: {
      limit: 5,
      ttl: 180_000,
    },
  })
  googleLogin() {}

  /**
   * GET /auth/google/callback

   */
  @Get('google/callback')
  @Public()
  @UseGuards(GoogleAuthGuard)
  @Throttle({
    default: {
      limit: 3,
      ttl: 180_000,
    },
  })
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const user = req.user as User;

    const tokens = await this.authService.handleGoogleCallback(user);

    const frontendUrl = this.authService.getFrontendUrl();

    res.cookie('access_token', tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    res.redirect(`${frontendUrl}/auth/success`);
  }

  @Post('set-password')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 180_000 } })
  setPassword(@CurrentUser() user: User, @Body() dto: SetPasswordDto) {
    return this.authService.setPassword(user.id, dto.newPassword);
  }
  /* =====================================================
      SESSION MANAGEMENT
  ===================================================== */

  @Post('logout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 3,
      ttl: 180_000,
    },
  })
  logout(@Req() req: Request) {
    const token = this.extractBearerToken(req);
    return this.authService.logout(token);
  }

  @Post('logout-all')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 3,
      ttl: 180_000,
    },
  })
  logoutAll(@CurrentUser() user: User, @Req() req: Request) {
    const token = this.extractBearerToken(req);
    return this.authService.logoutAll(user.id, token);
  }

  /* =====================================================
      PASSWORD RESET
  ===================================================== */

  @Post('reset/send-code')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 3,
      ttl: 180_000,
    },
  })
  sendResetCode(@Body('email') email: string) {
    return this.resetPasswordService.sendResetCode(email);
  }

  @Post('reset/verify')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 3,
      ttl: 180_000,
    },
  })
  verifyResetCode(@Body('email') email: string, @Body('code') code: string) {
    return this.resetPasswordService.verifyResetCode(email, code);
  }

  @Post('reset/change-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 3,
      ttl: 180_000,
    },
  })
  changePassword(@Body() reset: ChangePasswordDto) {
    return this.resetPasswordService.changePassword(reset);
  }

  /* =====================================================
      HELPERS
  ===================================================== */

  private extractBearerToken(req: Request): string {
    return req.headers.authorization?.split(' ')[1] ?? '';
  }
}
