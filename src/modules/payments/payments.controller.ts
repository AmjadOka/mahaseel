import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
  Headers,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiExcludeEndpoint,
} from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, Roles, Public } from '../../common/decorators';
import { Role } from 'src/common/enums/role.enum';
import { User } from '../users/entities/user.entity';
import type { AuthUser } from 'src/common/types';

@ApiTags('payments')
@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @Roles(Role.BUYER)
  @ApiOperation({ summary: 'List buyer payments' })
  getBuyerPayments(@CurrentUser() user: User) {
    return this.paymentsService.getBuyerPayments(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payment detail' })
  getPaymentDetail(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.paymentsService.getPaymentDetail(id, user.sub);
  }

  @Post('orders/:orderId/initiate')
  @Roles(Role.BUYER)
  @ApiOperation({
    summary: 'Initiate payment for accepted order (redirects to Moyasar)',
  })
  initiatePayment(
    @Param('orderId') orderId: string,
    @CurrentUser() user: User,
  ) {
    return this.paymentsService.initiatePayment(orderId, user.id);
  }

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    const rawBody = req.rawBody?.toString('utf-8') || JSON.stringify(req.body);

    if (!rawBody) {
      throw new BadRequestException('Missing raw body');
    }
    await this.paymentsService.handleWebhook(rawBody, signature);
    return { received: true };
  }
}
