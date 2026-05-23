import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { UsersService } from './users.service';
import type { UpdateProfileDto } from './users.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators';
import { ApiBody, ApiConsumes, ApiOperation } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { FileValidationPipe } from '../upload/validation.pipe';

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ── Public ─────────────────────────────────────────────────────────────────

  /**
   * GET /users/:id/profile
   * Public — returns only safe fields for active, non-deleted users.
   */
  @Get(':id/profile')
  getPublicProfile(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getPublicProfile(id);
  }

  /**
   * GET /users/:id/stats
   * Public — order counts and rating summary.
   */
  @Get(':id/stats')
  getStats(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getStats(id);
  }

  // ── Authenticated — self only ───────────────────────────────────────────────

  /**
   * GET /users/me
   * Returns the full user row for the authenticated caller.
   */

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@CurrentUser('id') id: string) {
    return this.usersService.findById(id);
  }

  /**
   * PATCH /users/me
   * Updates fullName and/or bio.
   */

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateProfile(@CurrentUser('id') id: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/avatar')
  @ApiOperation({ summary: 'Upload or replace the current user avatar' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() })) // ← memoryStorage, never disk
  uploadAvatar(
    @CurrentUser('id') id: string,
    @UploadedFile(FileValidationPipe) file: Express.Multer.File, // ← validated before hitting service
  ) {
    return this.usersService.uploadAvatar(id, file); // ← pass whole file, not buffer parts
  }

  /**
   * DELETE /users/me/avatar
   */
  @UseGuards(JwtAuthGuard)
  @Delete('me/avatar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove the current user avatar' })
  removeAvatar(@CurrentUser('id') id: string) {
    return this.usersService.removeAvatar(id);
  }

  /**
   * DELETE /users/me
   * Soft-deletes the authenticated user's account.
  @UseGuards(JwtAuthGuard)
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  softDelete(@CurrentUser('id') id: string) {
    return this.usersService.softDelete(id);
  }
       */
}
