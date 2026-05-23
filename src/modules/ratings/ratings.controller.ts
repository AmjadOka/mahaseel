import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from 'src/common/decorators';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { User } from '../users/entities/user.entity';
import { CreateRatingDto } from './dto/creat-rating.dto';
import { RatingsService } from './ratings.service';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import { FlagRatingDto, ReviewFlagDto } from './dto/flag-rating.dto';
import { Role } from 'src/common/enums/role.enum';

@ApiTags('ratings')
@Controller('ratings')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a rating for a completed order' })
  create(@CurrentUser() user: User, @Body() dto: CreateRatingDto) {
    return this.ratingsService.create(user.id, dto);
  }

  @Get('given')
  @ApiOperation({ summary: 'Ratings I submitted' })
  getGiven(@CurrentUser() user: User, @Query() pagination: PaginationDto) {
    return this.ratingsService.getGiven(user.id, pagination);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Public ratings received by any user/merchant' })
  getByUser(
    @Param('userId') userId: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.ratingsService.getByUser(userId, pagination);
  }

  @Post(':id/flag')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Flag an abusive or false rating (reviewed party only)',
  })
  flagRating(
    @Param('id') ratingId: string,
    @CurrentUser() user: User,
    @Body() dto: FlagRatingDto,
  ) {
    return this.ratingsService.flagRating(ratingId, user.id, dto);
  }

  // ─── Admin ───────────────────────────────────────────────────────────────

  @Get('admin/flags')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] List pending rating flags' })
  getPendingFlags(@Query() pagination: PaginationDto) {
    return this.ratingsService.getPendingFlags(pagination);
  }

  @Patch('admin/flags/:flagId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Dismiss or remove a flagged rating' })
  resolveFlag(@Param('flagId') flagId: string, @Body() dto: ReviewFlagDto) {
    return this.ratingsService.resolveFlag(flagId, dto);
  }
}
