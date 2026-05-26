import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { BankAccount } from './entities/bank-account.entity';
import { User } from '../users/entities/user.entity';
import { Role } from 'src/common/enums/role.enum';
import {
  CreateBankAccountDto,
  UpdateBankAccountDto,
} from './dto/create-bank-account.dto';

@Injectable()
export class BankAccountService {
  constructor(
    @InjectRepository(BankAccount)
    private readonly repo: Repository<BankAccount>,

    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,

    private readonly dataSource: DataSource,
  ) {}

  /* =====================================================
      GET MY ACCOUNTS
  ===================================================== */

  async getMyAccounts(userId: string): Promise<BankAccount[]> {
    return this.repo.find({
      where: { userId, isActive: true },
      order: { isDefault: 'DESC', createdAt: 'ASC' },
    });
  }

  /* =====================================================
      ADD ACCOUNT
  ===================================================== */

  async addAccount(
    userId: string,
    dto: CreateBankAccountDto,
  ): Promise<BankAccount> {
    await this.assertMerchant(userId);

    // Prevent duplicate account numbers for the same user
    const duplicate = await this.repo.findOne({
      where: { userId, accountNumber: dto.accountNumber, isActive: true },
    });

    if (duplicate) {
      throw new BadRequestException('This account number is already saved');
    }

    const existingCount = await this.repo.count({
      where: { userId, isActive: true },
    });

    const account = this.repo.create({
      ...dto,
      userId,
      // First account is automatically the default
      isDefault: existingCount === 0,
    });

    return this.repo.save(account);
  }

  /* =====================================================
      UPDATE ACCOUNT
  ===================================================== */

  async updateAccount(
    userId: string,
    accountId: string,
    dto: UpdateBankAccountDto,
  ): Promise<BankAccount> {
    const account = await this.findOwned(userId, accountId);

    // If account number changes, check for duplicate
    if (dto.accountNumber && dto.accountNumber !== account.accountNumber) {
      const duplicate = await this.repo.findOne({
        where: { userId, accountNumber: dto.accountNumber, isActive: true },
      });
      if (duplicate) {
        throw new BadRequestException('This account number is already saved');
      }
    }

    Object.assign(account, dto);
    return this.repo.save(account);
  }

  /* =====================================================
      SET DEFAULT
  ===================================================== */

  async setDefault(userId: string, accountId: string): Promise<BankAccount> {
    const account = await this.findOwned(userId, accountId);

    // Use a transaction to atomically swap the default flag
    await this.dataSource.transaction(async (manager) => {
      // Clear existing default
      await manager.update(
        BankAccount,
        { userId, isDefault: true },
        { isDefault: false },
      );

      // Set new default
      account.isDefault = true;
      await manager.save(account);
    });

    return account;
  }

  /* =====================================================
      DELETE ACCOUNT
  ===================================================== */

  async deleteAccount(
    userId: string,
    accountId: string,
  ): Promise<{ message: string }> {
    const account = await this.findOwned(userId, accountId);

    // Soft-delete by marking inactive
    account.isActive = false;
    await this.repo.save(account);

    // If deleted account was the default, promote the oldest remaining account
    if (account.isDefault) {
      const next = await this.repo.findOne({
        where: { userId, isActive: true },
        order: { createdAt: 'ASC' },
      });

      if (next) {
        next.isDefault = true;
        await this.repo.save(next);
      }
    }

    return { message: 'Bank account removed' };
  }

  /* =====================================================
      ADMIN — get accounts for any merchant
  ===================================================== */

  async getAccountsForUser(userId: string): Promise<BankAccount[]> {
    return this.repo.find({
      where: { userId, isActive: true },
      order: { isDefault: 'DESC', createdAt: 'ASC' },
    });
  }

  /* =====================================================
      HELPERS
  ===================================================== */

  private async assertMerchant(userId: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });

    if (!user) throw new NotFoundException('User not found');

    if (user.role !== Role.MERCHANT) {
      throw new ForbiddenException('Only merchants can manage bank accounts');
    }

    return user;
  }

  private async findOwned(
    userId: string,
    accountId: string,
  ): Promise<BankAccount> {
    const account = await this.repo.findOne({
      where: { id: accountId, userId, isActive: true },
    });

    if (!account) throw new NotFoundException('Bank account not found');

    return account;
  }
}
