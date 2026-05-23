import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { WithdrawDto } from './dto/Withdraw.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, Roles } from '../../common/decorators';
import { Role } from 'src/common/enums/role.enum';
import { PaginationDto } from '../../common/dto/pagination.dto';
import type { AuthUser } from 'src/common/types';

// User entity import removed — JwtAuthGuard provides AuthUser from the JWT
// payload. Injecting the full User entity here would require a DB roundtrip
// interceptor that isn't wired up, making user.id unreliable.

@ApiTags('wallet')
@Controller('wallet')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
@Roles(Role.MERCHANT)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @ApiOperation({ summary: 'Get wallet summary' })
  getWallet(@CurrentUser() user: AuthUser) {
    return this.walletService.getWallet(user.sub);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'List wallet transactions' })
  getTransactions(
    @CurrentUser() user: AuthUser,
    @Query() pagination: PaginationDto,
  ) {
    return this.walletService.getTransactions(user.sub, pagination);
  }

  @Post('withdraw')
  @ApiOperation({ summary: 'Request withdrawal' })
  withdraw(@CurrentUser() user: AuthUser, @Body() dto: WithdrawDto) {
    return this.walletService.requestWithdrawal(user.sub, dto);
  }

  @Get('withdrawals')
  @ApiOperation({ summary: 'List withdrawal requests' })
  getWithdrawals(@CurrentUser() user: AuthUser) {
    return this.walletService.getWithdrawals(user.sub);
  }
}
