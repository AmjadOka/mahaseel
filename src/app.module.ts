import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import redisConfig from './config/redis.config';
import googleConfig from './config/google.config';

import { RedisModule } from './shared/redis/redis.module';
import { BullModule } from '@nestjs/bullmq';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { FarmsModule } from './modules/farms/farms.module';
import { ProductsModule } from './modules/products/products.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { OrdersModule } from './modules/orders/orders.module';
import { AuctionsModule } from './modules/auctions/auctions.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { RatingsModule } from './modules/ratings/ratings.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AdminModule } from './modules/admin/admin.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { UploadModule } from './modules/upload/upload.module';
import { BankAccountModule } from './modules/bank-account/bank-account.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig, redisConfig, googleConfig],
      envFilePath: '.env',
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('database.host'),
        port: config.get('database.port'),
        username: config.get('database.username'),
        password: config.get('database.password'),
        database: config.get('database.name'),
        synchronize: true, //config.get('database.sync'),
        logging: config.get('database.logging'),
        autoLoadEntities: true,
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
      }),
    }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],

      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('app.throttleTtl', 60),
            limit: config.get<number>('app.throttleLimit', 100),
          },
        ],
      }),
    }),

    EventEmitterModule.forRoot(),
    // StorageModule,

    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          password: config.get<string>('redis.password'),
        },

        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      }),
    }),

    RedisModule,

    AuthModule,
    UsersModule,
    FarmsModule,
    ProductsModule,
    CategoriesModule,
    OrdersModule,
    AuctionsModule,
    PaymentsModule,
    WalletModule,
    RatingsModule,
    NotificationsModule,
    AdminModule,
    UploadModule,
    BankAccountModule,
  ],
})
export class AppModule {}
