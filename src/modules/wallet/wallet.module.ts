import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import {
  Wallet,
  WalletTransaction,
  WithdrawalRequest,
} from './entities/wallet.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { BankAccount } from '../bank-account/entities/bank-account.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Wallet,
      WalletTransaction,
      WithdrawalRequest,
      BankAccount,
    ]),
    NotificationsModule,
  ],
  providers: [WalletService],
  controllers: [WalletController],
  exports: [WalletService, TypeOrmModule],
})
export class WalletModule {}
