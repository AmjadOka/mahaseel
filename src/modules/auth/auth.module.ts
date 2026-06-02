import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { User } from '../users/entities/user.entity';
import { RedisModule } from 'src/shared/redis/redis.module';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';
import { ResetPasswordService } from './services/reset-password.service';

import { MailModule } from 'src/shared/mail/mail.module';

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
        global: true,
      }),
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    RedisModule,
    MailModule,
  ],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    ResetPasswordService,
    JwtStrategy,
    GoogleStrategy,
  ],
  controllers: [AuthController],
  exports: [AuthService, JwtStrategy, PassportModule],
})
export class AuthModule {}
