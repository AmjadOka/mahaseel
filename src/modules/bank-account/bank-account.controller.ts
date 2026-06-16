import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { BankAccountService } from './bank-account.service';
import {
  CreateBankAccountDto,
  UpdateBankAccountDto,
} from './dto/create-bank-account.dto';
import { CurrentUser } from 'src/common/decorators';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators';
import { Role } from 'src/common/enums/role.enum';
import type { AuthUser } from 'src/common/types';

@ApiTags('bank-accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('bank-accounts')
export class BankAccountController {
  constructor(private readonly service: BankAccountService) {}

  /* ── Merchant routes ──────────────────────────────── */

  @Get()
  @Roles(Role.MERCHANT)
  @ApiOperation({ summary: 'Get my bank accounts' })
  getMyAccounts(@CurrentUser() user: AuthUser) {
    return this.service.getMyAccounts(user.sub);
  }

  @Post()
  @Roles(Role.MERCHANT)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a bank account' })
  addAccount(@CurrentUser() user: AuthUser, @Body() dto: CreateBankAccountDto) {
    return this.service.addAccount(user.sub, dto);
  }

  @Patch(':id')
  @Roles(Role.MERCHANT)
  @ApiOperation({ summary: 'Update a bank account' })
  updateAccount(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBankAccountDto,
  ) {
    return this.service.updateAccount(user.sub, id, dto);
  }

  @Patch(':id/default')
  @Roles(Role.MERCHANT)
  @ApiOperation({ summary: 'Set as default bank account' })
  setDefault(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.setDefault(user.sub, id);
  }

  @Delete(':id')
  @Roles(Role.MERCHANT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a bank account' })
  deleteAccount(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.deleteAccount(user.sub, id);
  }

  /* ── Admin routes ─────────────────────────────────── */

  @Get('admin/bank/user/:userId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Get bank accounts for a merchant' })
  getAccountsForUser(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.service.getAccountsForUser(userId);
  }
}
