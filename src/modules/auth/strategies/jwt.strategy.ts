import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { User } from 'src/modules/users/entities/user.entity';
import { RedisService } from 'src/shared/redis/redis.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,

    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,

    private readonly redisService: RedisService,
  ) {
    const options: StrategyOptions = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),

      ignoreExpiration: false,

      secretOrKey: config.getOrThrow<string>('jwt.accessSecret'),
    };

    super(options);
  }

  async validate(payload: JwtPayload) {
    /**
     * Ensure access token
     */
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    /**
     * Redis blacklist check
     */
    const blacklisted = await this.redisService.exists(`bl:${payload.jti}`);

    if (blacklisted) {
      throw new UnauthorizedException('Token revoked');
    }

    /**
     * Cached user
     */
    const cacheKey = `auth_user:${payload.sub}`;

    const cachedUser = await this.redisService.get(cacheKey);

    if (cachedUser) {
      const user = JSON.parse(cachedUser) as JwtPayload;

      if (user.tokenVersion !== payload.tokenVersion) {
        throw new UnauthorizedException('Session expired');
      }

      return user;
    }

    /**
     * Database fallback
     */
    const user = await this.usersRepo.findOne({
      where: {
        id: payload.sub,

        isActive: true,

        isDeleted: false,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found or inactive');
    }

    /**
     * Token version validation
     */
    if (user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('Session expired');
    }

    /**
     * Sanitized auth user
     */
    const authUser = {
      id: user.id,

      sub: user.id,

      role: user.role,

      email: user.email,
      phone: user.phone,

      tokenVersion: user.tokenVersion,
    };

    /**
     * Cache user for 60s
     */
    await this.redisService.set(cacheKey, JSON.stringify(authUser), 60);

    return authUser;
  }
}
