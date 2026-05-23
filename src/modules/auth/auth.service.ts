import {
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

import { User } from '../users/entities/user.entity';
import { Role } from 'src/common/enums/role.enum';
import { SignUpDto } from './dto/sign-up.dto';
import { SignInDto } from './dto/sign-in.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';
import { RedisService } from 'src/shared/redis/redis.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,

    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tokenService: TokenService,
    private readonly redisService: RedisService,
  ) {}

  /* =====================================================
      SIGN UP
  ===================================================== */

  async signUp(dto: SignUpDto) {
    const exists = await this.usersRepository.findOne({
      where: [{ email: dto.email }, { phone: dto.phone }],
    });

    if (exists) {
      throw new ConflictException('Email or phone already exists');
    }

    const hashedPassword = await this.passwordService.hash(dto.password);

    const user = this.usersRepository.create({
      email: dto.email,
      phone: dto.phone,
      fullName: dto.fullName,
      password: hashedPassword,
      role: Role.BUYER, // Default role for new users
    });

    await this.usersRepository.save(user);

    // New users start at tokenVersion 0 (entity default)
    const tokens = await this.tokenService.generateTokens(
      user.id,
      user.role,
      user.email,
      user.tokenVersion,
    );

    user.refreshTokenHash = this.tokenService.hashToken(tokens.refreshToken);
    await this.usersRepository.save(user);

    return {
      message: 'Registered successfully',
      user: instanceToPlain(user),
      ...tokens,
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

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await this.passwordService.compare(
      dto.password,
      user.password,
    );

    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    const tokens = await this.tokenService.generateTokens(
      user.id,
      user.role,
      user.email,
      user.tokenVersion,
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
      REFRESH TOKEN
  ===================================================== */

  async refresh(refreshToken: string) {
    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.getOrThrow<string>('jwt.refreshSecret'), // FIX: was this.config
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Blacklist check
    const blacklisted = await this.redisService.exists(`bl:${payload.jti}`);
    if (blacklisted) {
      throw new UnauthorizedException('Token revoked');
    }

    const hashed = this.tokenService.hashToken(refreshToken);

    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect(['user.refreshTokenHash'])
      .where('user.refreshTokenHash = :hashed', { hashed })
      .getOne();

    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('Session expired');
    }

    const tokens = await this.tokenService.generateTokens(
      user.id,
      user.role,
      user.email,
      user.tokenVersion,
    );

    user.refreshTokenHash = this.tokenService.hashToken(tokens.refreshToken);
    await this.usersRepository.save(user);

    return tokens;
  }

  /* =====================================================
      LOGOUT (single device — blacklists current access token)
  ===================================================== */

  async logout(accessToken: string): Promise<{ message: string }> {
    const decoded: JwtPayload | null = this.jwtService.decode(accessToken);

    if (!decoded || decoded.type !== 'access' || !decoded.jti || !decoded.exp) {
      return { message: 'Logged out' };
    }

    const ttl = decoded.exp - Math.floor(Date.now() / 1000);

    if (ttl > 0) {
      await this.redisService.set(`bl:${decoded.jti}`, '1', ttl);
    }

    return { message: 'Logged out' };
  }

  /* =====================================================
      LOGOUT ALL (all devices — bumps tokenVersion)
  ===================================================== */

  async logoutAll(
    userId: string,
    accessToken: string,
  ): Promise<{ message: string }> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Invalidate all existing JWTs by bumping the version
    user.tokenVersion += 1;
    user.refreshTokenHash = null;
    await this.usersRepository.save(user);

    // Also blacklist the current access token so it can't be reused
    await this.logout(accessToken);

    // Clear any Redis auth cache for this user
    await this.redisService.del(`auth_user:${userId}`);

    return { message: 'Logged out from all devices' };
  }
}
