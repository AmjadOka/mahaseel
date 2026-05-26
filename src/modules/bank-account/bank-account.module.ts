import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BankAccount } from './entities/bank-account.entity';
import { BankAccountService } from './bank-account.service';
import { BankAccountController } from './bank-account.controller';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BankAccount, User])],
  providers: [BankAccountService],
  controllers: [BankAccountController],
  exports: [BankAccountService],
})
export class BankAccountModule {}
