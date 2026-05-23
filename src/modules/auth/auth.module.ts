import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { User } from '../users/entities/user.entity';
import { RedisModule } from 'src/shared/redis/redis.module';
import { ConfigService } from '@nestjs/config';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';
import { ResetPasswordService } from './services/reset-password.service';
import type { StringValue } from 'ms';
@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.registerAsync({
      inject: [ConfigService],

      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwt.accessSecret'),

        signOptions: {
          expiresIn: config.getOrThrow<StringValue>('jwt.accessExpires'),
        },
      }),
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    RedisModule,
  ],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    ResetPasswordService,
    JwtStrategy,
  ],
  controllers: [AuthController],
  exports: [AuthService, JwtStrategy, PassportModule],
})
export class AuthModule {}
