import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  ParseUUIDPipe,
  Put,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';

import { AuctionsService } from './auctions.service';
import { PlaceBidDto } from './dto/create-bid.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, Roles } from '../../common/decorators';
import { Role } from 'src/common/enums/role.enum';
import type { AuthUser } from 'src/common/types';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { FileValidationPipe } from '../upload/validation.pipe';

// ─────────────────────────────────────────────────────────────────────────────
// BUYER — /auctions/bids
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Auctions — Buyer')
@Controller('auctions/bids')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
@Roles(Role.BUYER)
export class AuctionBidsController {
  constructor(private readonly auctionsService: AuctionsService) {}

  /**
   * POST /auctions/bids
   * Place a new bid on an active auction product.
   */
  @Post()
  @ApiOperation({ summary: 'Place a bid on an auction product' })
  placeBid(
    @CurrentUser() user: AuthUser,
    @Body() dto: PlaceBidDto,
    @Req() req: any,
  ) {
    return this.auctionsService.placeBid(user.sub, dto, req.ip);
  }

  /**
   * GET /auctions/bids/mine
   * List all active bids placed by the authenticated buyer.
   */
  @Get('mine')
  @ApiOperation({ summary: 'List my active bids' })
  getMyBids(@CurrentUser() user: AuthUser) {
    return this.auctionsService.getMyBids(user.sub);
  }

  /**
   * DELETE /auctions/bids/:bidId
   * Withdraw a bid — updates product currentBid to next highest.
   */
  @Delete(':bidId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Withdraw a bid' })
  withdrawBid(@Param('bidId') bidId: string, @CurrentUser() user: AuthUser) {
    return this.auctionsService.withdrawBid(bidId, user.sub);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MERCHANT — /auctions/merchant
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Auctions — Merchant')
@Controller('auctions/merchant')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
@Roles(Role.MERCHANT)
export class AuctionMerchantController {
  constructor(private readonly auctionsService: AuctionsService) {}

  /**
   * GET /auctions/merchant/products/:productId/bids
   * List all bids on a merchant's auction product, sorted highest first.
   */
  @Get('products/:productId/bids')
  @ApiOperation({ summary: 'Get all bids on my auction product' })
  getBidsForProduct(
    @Param('productId') productId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.auctionsService.getBidsForProduct(productId, user.sub);
  }

  /**
   * POST /auctions/merchant/bids/:bidId/accept
   * Accept a specific bid — closes the auction early, credits merchant wallet.
   */
  @Post('bids/:bidId/accept')
  @ApiOperation({ summary: 'Accept a bid — closes auction and credits wallet' })
  acceptBid(@Param('bidId') bidId: string, @CurrentUser() user: AuthUser) {
    return this.auctionsService.acceptBid(bidId, user.sub);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. AuctionsController — add the two endpoints
  // ─────────────────────────────────────────────────────────────────────────────

  @Put(':productId/image')
  @ApiOperation({ summary: 'Upload or replace the auction cover image' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  uploadImage(
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile(FileValidationPipe) file: Express.Multer.File,
  ) {
    return this.auctionsService.uploadImage(productId, user.sub, file);
  }

  @Delete(':productId/image')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove the auction cover image' })
  removeImage(
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.auctionsService.removeImage(productId, user.sub);
  }
}
