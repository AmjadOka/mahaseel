import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';

import { User } from '../../users/entities/user.entity';
import { PasswordService } from './password.service';

@Injectable()
export class ResetPasswordService {
  private readonly CODE_TTL_MS = 10 * 60 * 1000; // 10 min — code validity
  private readonly VERIFIED_TTL_MS = 15 * 60 * 1000; // 15 min — window to set new password
  private readonly MAX_ATTEMPTS = 3;

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly passwordService: PasswordService,
  ) {}

  /* =====================================================
      SEND RESET CODE
  ===================================================== */

  async sendResetCode(email: string) {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect(['user.resetCode', 'user.resetExpires', 'user.resetAttempts'])
      .where('user.email = :email', { email })
      .getOne();

    // Always return the same message to avoid user enumeration
    if (!user) {
      return { message: 'If the email exists, a reset code was sent.' };
    }

    const code = crypto.randomInt(100_000, 999_999).toString();

    user.resetCode = code;
    user.resetExpires = new Date(Date.now() + this.CODE_TTL_MS);
    user.resetAttempts = 0;
    user.isResetVerified = false;

    await this.usersRepository.save(user);

    // TODO: send email with code here

    return { message: 'If the email exists, a reset code was sent.' };
  }

  /* =====================================================
      VERIFY RESET CODE
  ===================================================== */

  async verifyResetCode(email: string, code: string) {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect([
        'user.resetCode',
        'user.resetExpires',
        'user.resetAttempts',
        'user.isResetVerified',
      ])
      .where('user.email = :email', { email })
      .getOne();

    if (!user) {
      throw new BadRequestException('Invalid or expired code');
    }

    if (!user.resetExpires || user.resetExpires < new Date()) {
      throw new BadRequestException('Code expired');
    }

    if (user.resetAttempts >= this.MAX_ATTEMPTS) {
      throw new BadRequestException('Too many failed attempts');
    }

    if (user.resetCode !== code) {
      user.resetAttempts += 1;
      await this.usersRepository.save(user); // FIX: removed duplicate save
      throw new BadRequestException('Invalid reset code');
    }

    // Code is valid — open the 15-minute window to set a new password
    user.isResetVerified = true;
    user.resetExpires = new Date(Date.now() + this.VERIFIED_TTL_MS); // FIX: this is reused as the verified window
    user.resetAttempts = 0;

    await this.usersRepository.save(user); // FIX: was saved twice identically

    return { message: 'Code verified successfully' };
  }

  /* =====================================================
      CHANGE PASSWORD
  ===================================================== */

  async changePassword(email: string, newPassword: string) {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect([
        'user.password',
        'user.isResetVerified',
        'user.resetExpires', // FIX: was checking non-existent resetVerifiedExpires
      ])
      .where('user.email = :email', { email })
      .getOne();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isResetVerified) {
      throw new BadRequestException('Reset code not verified');
    }

    // resetExpires is repurposed as the post-verification window in verifyResetCode
    if (!user.resetExpires || user.resetExpires < new Date()) {
      throw new BadRequestException('Reset verification expired');
    }

    user.password = await this.passwordService.hash(newPassword);

    // Invalidate all sessions and clear reset state
    user.refreshTokenHash = null;
    user.resetCode = null;
    user.resetExpires = null;
    user.resetAttempts = 0;
    user.isResetVerified = false;

    await this.usersRepository.save(user);

    return { message: 'Password changed successfully' };
  }
}
