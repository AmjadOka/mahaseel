import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { instanceToPlain } from 'class-transformer';
import * as crypto from 'crypto';
import type { Profile } from 'passport-google-oauth20';

import { User } from '../users/entities/user.entity';
import { Role } from 'src/common/enums/role.enum';
import { SignUpDto } from './dto/sign-up.dto';
import { SignInDto } from './dto/sign-in.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';
import { RedisService } from 'src/shared/redis/redis.service';
import { MailProvider } from 'src/shared/mail/mail.provider';
import { EmailTemplate } from 'src/common/enums/email.enum';

const VERIFICATION_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly frontendUrl: string;

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,

    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tokenService: TokenService,
    private readonly redisService: RedisService,
    private readonly mail: MailProvider,
  ) {
    this.frontendUrl = this.configService.getOrThrow<string>('app.frontendUrl');
  }

  getFrontendUrl(): string {
    return this.frontendUrl;
  }

  /* =====================================================
      SIGN UP
  ===================================================== */

  async signUp(dto: SignUpDto) {
    const exists = await this.usersRepository.findOne({
      where: [{ email: dto.email }, { phone: dto.phone }],
    });

    if (exists) throw new ConflictException('Email or phone already in use');

    const code = this.generateCode();

    const user = this.usersRepository.create({
      email: dto.email,
      phone: dto.phone,
      fullName: dto.fullName,
      password: await this.passwordService.hash(dto.password),
      role: Role.BUYER,
      isActive: false,
      isVerified: false,
      emailVerificationCode: code,
      emailVerificationExpires: new Date(Date.now() + VERIFICATION_TTL_MS),
    });

    await this.usersRepository.save(user);

    void this.mail.send({
      to: user.email,
      template: EmailTemplate.EMAIL_VERIFICATION,
      subject: 'Activate your Mahaseel account',
      context: { code, name: user.fullName },
    });

    return {
      message:
        'Registered successfully. Please check your email for the activation code.',
    };
  }

  /* =====================================================
      VERIFY EMAIL
  ===================================================== */

  async verifyEmail(email: string, code: string) {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect([
        'user.emailVerificationCode',
        'user.emailVerificationExpires',
      ])
      .where('user.email = :email', { email })
      .getOne();

    if (!user) throw new BadRequestException('Invalid or expired code');
    if (user.isActive)
      throw new BadRequestException('Account is already active');

    if (
      !user.emailVerificationExpires ||
      user.emailVerificationExpires < new Date()
    ) {
      throw new BadRequestException(
        'Verification code expired. Request a new one.',
      );
    }

    if (user.emailVerificationCode !== code) {
      throw new BadRequestException('Invalid verification code');
    }

    user.isActive = true;
    user.isVerified = true;
    user.emailVerificationCode = null;
    user.emailVerificationExpires = null;

    const tokens = await this.tokenService.generateTokens(
      user.id,
      user.role,
      user.email,
      user.tokenVersion,
      user.phone,
    );

    user.refreshTokenHash = this.tokenService.hashToken(tokens.refreshToken);
    await this.usersRepository.save(user);

    void this.mail.send({
      to: user.email,
      template: EmailTemplate.WELCOME,
      subject: 'welcome to mahaseel',
      context: { name: user.fullName },
    });
    return {
      message: 'Email verified successfully',
      user: instanceToPlain(user),
      ...tokens,
    };
  }

  /* =====================================================
      RESEND VERIFICATION CODE
  ===================================================== */

  async resendVerificationCode(email: string) {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect([
        'user.emailVerificationCode',
        'user.emailVerificationExpires',
      ])
      .where('user.email = :email', { email })
      .getOne();

    if (!user || user.isActive) {
      return {
        message:
          'If the account exists and is unverified, a new code was sent.',
      };
    }

    const code = this.generateCode();
    user.emailVerificationCode = code;
    user.emailVerificationExpires = new Date(Date.now() + VERIFICATION_TTL_MS);
    await this.usersRepository.save(user);

    void this.mail.send({
      to: user.email,
      template: EmailTemplate.EMAIL_VERIFICATION,
      subject: 'Your new Mahaseel activation code',
      context: { code, name: user.fullName },
    });

    return {
      message: 'If the account exists and is unverified, a new code was sent.',
    };
  }

  /* =====================================================
      SIGN IN
  ===================================================== */

  async signIn(dto: SignInDto) {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect(['user.password', 'user.refreshTokenHash'])
      .where('user.email = :email', { email: dto.email })
      .getOne();

    if (!user) throw new UnauthorizedException('Invalid credentials');

    // Google-only account — no password set yet
    if (!user.password) {
      throw new UnauthorizedException('unauthorized');
    }

    const valid = await this.passwordService.compare(
      dto.password,
      user.password,
    );
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (!user.isActive) {
      throw new UnauthorizedException(
        user.isVerified
          ? 'Account is disabled. Please contact support.'
          : 'Please verify your email address before signing in.',
      );
    }

    const tokens = await this.tokenService.generateTokens(
      user.id,
      user.role,
      user.email,
      user.tokenVersion,
      user.phone,
    );

    user.refreshTokenHash = this.tokenService.hashToken(tokens.refreshToken);
    await this.usersRepository.save(user);

    return {
      message: 'Login successful',
      user: instanceToPlain(user),
      ...tokens,
    };
  }

  /* =====================================================
      SET PASSWORD (for Google OAuth users)
  ===================================================== */

  async setPassword(userId: string, newPassword: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });

    if (!user) throw new NotFoundException('User not found');

    if (user.password) {
      throw new BadRequestException(
        'Account already has a password. Use the reset flow to change it.',
      );
    }

    user.password = await this.passwordService.hash(newPassword);
    await this.usersRepository.save(user);

    return {
      message: 'Password set. You can now sign in with email and password.',
    };
  }

  /* =====================================================
      GOOGLE OAUTH — find or create
  ===================================================== */

  async findOrCreateGoogleUser(profile: Profile) {
    const googleEmail = profile.emails?.[0]?.value;
    if (!googleEmail)
      throw new UnauthorizedException('No email returned from Google');

    // 1. Known Google user
    let user = await this.usersRepository.findOne({
      where: { googleId: profile.id },
    });
    if (user) return user;

    // 2. Existing email/password account — link Google to it
    user = await this.usersRepository.findOne({
      where: { email: googleEmail },
    });
    if (user) {
      user.googleId = profile.id;
      if (!user.isActive) {
        user.isActive = true;
        user.isVerified = true;
        user.emailVerificationCode = null;
        user.emailVerificationExpires = null;
      }
      return this.usersRepository.save(user);
    }

    // 3. Brand-new Google user
    return this.usersRepository.save(
      this.usersRepository.create({
        email: googleEmail,
        fullName: profile.displayName ?? null,
        profileImage: profile.photos?.[0]?.value ?? undefined,
        googleId: profile.id,
        password: null,
        phone: undefined,
        role: Role.BUYER,
        isActive: true,
        isVerified: true,
      }),
    );
  }

  /* =====================================================
      REFRESH TOKEN
  ===================================================== */

  async refresh(refreshToken: string) {
    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.getOrThrow<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.type !== 'refresh')
      throw new UnauthorizedException('Invalid token type');

    const blacklisted = await this.redisService.exists(`bl:${payload.jti}`);
    if (blacklisted) throw new UnauthorizedException('Token revoked');

    const hashed = this.tokenService.hashToken(refreshToken);

    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect(['user.refreshTokenHash'])
      .where('user.refreshTokenHash = :hashed', { hashed })
      .getOne();

    if (!user) throw new UnauthorizedException('Invalid refresh token');
    if (user.tokenVersion !== payload.tokenVersion)
      throw new UnauthorizedException('Session expired');

    const tokens = await this.tokenService.generateTokens(
      user.id,
      user.role,
      user.email,
      user.tokenVersion,
      user.phone,
    );

    user.refreshTokenHash = this.tokenService.hashToken(tokens.refreshToken);
    await this.usersRepository.save(user);

    return tokens;
  }

  /* =====================================================
      LOGOUT (single device)
  ===================================================== */

  async logout(accessToken: string): Promise<{ message: string }> {
    const decoded: JwtPayload | null = this.jwtService.decode(accessToken);

    if (!decoded || decoded.type !== 'access' || !decoded.jti || !decoded.exp) {
      return { message: 'Logged out' };
    }

    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) await this.redisService.set(`bl:${decoded.jti}`, '1', ttl);

    return { message: 'Logged out' };
  }

  /* =====================================================
      LOGOUT ALL
  ===================================================== */

  async logoutAll(
    userId: string,
    accessToken: string,
  ): Promise<{ message: string }> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    user.tokenVersion += 1;
    user.refreshTokenHash = null;
    await this.usersRepository.save(user);

    await this.logout(accessToken);
    await this.redisService.del(`auth_user:${userId}`);

    return { message: 'Logged out from all devices' };
  }

  /* =====================================================
    GOOGLE OAUTH — issue tokens after callback
===================================================== */

  async handleGoogleCallback(user: User) {
    const tokens = await this.tokenService.generateTokens(
      user.id,
      user.role,
      user.email,
      user.tokenVersion,
      user.phone,
    );

    user.refreshTokenHash = this.tokenService.hashToken(tokens.refreshToken);
    await this.usersRepository.save(user);

    return tokens;
  }
  /* =====================================================
      HELPERS
  ===================================================== */

  private generateCode(): string {
    return crypto.randomInt(100_000, 999_999).toString();
  }
}
