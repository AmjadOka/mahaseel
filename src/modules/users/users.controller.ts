import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Req,
  BadRequestException,
} from '@nestjs/common';

import { UsersService } from './users.service';
import type { UpdateProfileDto } from './users.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser, Public } from 'src/common/decorators';
import { ApiBody, ApiConsumes, ApiOperation } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { FileValidationPipe } from '../upload/validation.pipe';
// ─── Controller ───────────────────────────────────────────────────────────────

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ── Public ─────────────────────────────────────────────────────────────────

  /**
   * GET /users/:id/profile
   * Public — returns only safe fields for active, non-deleted users.
   */
  @Public()
  @Get(':id/profile')
  getPublicProfile(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getPublicProfile(id);
  }

  /**
   * GET /users/:id/stats
   * Public — order counts and rating summary.
   */
  @Public()
  @Get(':id/stats')
  getStats(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getStats(id);
  }

  // ── Authenticated — self only ───────────────────────────────────────────────

  /**
   * GET /users/me
   * Returns the full user row for the authenticated caller.
   */

  @Get('me')
  getMe(@CurrentUser('id') id: string) {
    return this.usersService.findById(id);
  }

  /**
   * PATCH /users/me
   * Updates fullName and/or bio.
   */

  @Patch('me')
  updateProfile(@CurrentUser('id') id: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(id, dto);
  }

  @Patch('me/avatar')
  @ApiOperation({ summary: 'Upload or replace the current user avatar' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  async uploadAvatar(
    @CurrentUser('id') id: string,
    @Req() req: FastifyRequest,
  ) {
    let file: Express.Multer.File | null = null;

    for await (const part of req.parts()) {
      if (part.type === 'file' && !file) {
        const buffer = await part.toBuffer();
        file = {
          fieldname: part.fieldname,
          originalname: part.filename,
          mimetype: part.mimetype,
          buffer,
          size: buffer.length,
          encoding: part.encoding,
        } as Express.Multer.File;
      }
    }

    if (!file) {
      throw new BadRequestException('No file provided');
    }

    new FileValidationPipe().transform(file);
    return this.usersService.uploadAvatar(id, file);
  }

  /**
   * DELETE /users/me/avatar
   */

  @Delete('me/avatar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove the current user avatar' })
  removeAvatar(@CurrentUser('id') id: string) {
    return this.usersService.removeAvatar(id);
  }

  @Patch('me/promote-to-merchant')
  promoteToMerchant(@CurrentUser('id') id: string) {
    return this.usersService.requestPromoteToMerchant(id);
  }
}
