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
import { MailProvider } from 'src/shared/mail/mail.provider';
import { EmailTemplate } from 'src/common/enums/email.enum';
import { ChangePasswordDto } from '../dto/change-password.dto';

@Injectable()
export class ResetPasswordService {
  private readonly CODE_TTL_MS = 10 * 60 * 1000; // 10 min — code validity
  private readonly VERIFIED_TTL_MS = 15 * 60 * 1000; // 15 min — window to set new password
  private readonly MAX_ATTEMPTS = 3;

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly passwordService: PasswordService,
    private readonly mail: MailProvider,
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

    void this.mail.send({
      to: user.email,
      template: EmailTemplate.PASSWORD_RESET,
      subject: 'Reset your Mahaseel password',
      context: { code },
    });

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

    if (!user) throw new BadRequestException('Invalid or expired code');

    if (!user.resetExpires || user.resetExpires < new Date()) {
      throw new BadRequestException('Code expired');
    }

    if (user.resetAttempts >= this.MAX_ATTEMPTS) {
      throw new BadRequestException('Too many failed attempts');
    }

    if (user.resetCode !== code) {
      user.resetAttempts += 1;
      await this.usersRepository.save(user);
      throw new BadRequestException('Invalid reset code');
    }

    // Open the 15-minute window to set a new password
    user.isResetVerified = true;
    user.resetExpires = new Date(Date.now() + this.VERIFIED_TTL_MS);
    user.resetAttempts = 0;

    await this.usersRepository.save(user);

    return { message: 'Code verified successfully' };
  }

  /* =====================================================
      CHANGE PASSWORD
  ===================================================== */

  async changePassword(changePasswordDto: ChangePasswordDto) {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect([
        'user.password',
        'user.isResetVerified',
        'user.resetExpires',
        'user.refreshTokenHash',
      ])
      .where('user.email = :email', { email: changePasswordDto.email })
      .getOne();

    if (!user) throw new NotFoundException('User not found');

    if (!user.isResetVerified)
      throw new BadRequestException('Reset code not verified');

    if (!user.resetExpires || user.resetExpires < new Date())
      throw new BadRequestException('Reset verification expired');

    user.password = await this.passwordService.hash(
      changePasswordDto.newPassword,
    );
    user.refreshTokenHash = null;
    user.tokenVersion += 1;
    user.resetCode = null;
    user.resetExpires = null;
    user.resetAttempts = 0;
    user.isResetVerified = false;

    await this.usersRepository.save(user);

    return { message: 'Password changed successfully' };
  }
}
