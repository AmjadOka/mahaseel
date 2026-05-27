import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { v4 as uuid } from 'uuid';
import ms from 'ms';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async generateTokens(
    userId: string,
    role: string,
    email: string,
    tokenVersion: number = 0,
  ) {
    const accessJti = uuid();
    const refreshJti = uuid();

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        {
          sub: userId,
          role,
          email,
          type: 'access',
          tokenVersion,
          jti: accessJti,
        },
        {
          secret: this.config.getOrThrow<string>('jwt.accessSecret'),
          expiresIn: this.config.getOrThrow<string>(
            'jwt.accessExpires',
          ) as ms.StringValue,
        },
      ),
      this.jwtService.signAsync(
        {
          sub: userId,
          role,
          email,
          type: 'refresh',
          tokenVersion,
          jti: refreshJti,
        },
        {
          secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
          expiresIn: this.config.getOrThrow<string>(
            'jwt.refreshExpires',
          ) as ms.StringValue,
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  /**
   * One-way hash of a token for safe DB storage.
   * Uses SHA-256 — fast and sufficient for bearer-token storage
   * (tokens are already high-entropy; bcrypt is unnecessary here).
   */
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
