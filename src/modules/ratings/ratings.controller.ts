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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from 'src/common/decorators';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CreateRatingDto } from './dto/creat-rating.dto';
import {
  FlagRatingDto,
  ReviewFlagDto,
  UpdateRatingDto,
} from './dto/flag-rating.dto';
import { RatingsService } from './ratings.service';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import { Role } from 'src/common/enums/role.enum';
import { FlagStatus } from './entities/rating.entity';
import type { AuthUser } from 'src/common/types';

@ApiTags('ratings')
@Controller('ratings')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  // ─── Ratings ──────────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a rating for a completed order' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRatingDto) {
    return this.ratingsService.create(user.sub, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a rating you submitted' })
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateRatingDto,
  ) {
    return this.ratingsService.update(id, user.sub, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Ratings I received' })
  getMyRatings(
    @CurrentUser() user: AuthUser,
    @Query() pagination: PaginationDto,
  ) {
    return this.ratingsService.getByUser(user.sub, pagination);
  }

  @Get('given')
  @ApiOperation({ summary: 'Ratings I submitted' })
  getGiven(@CurrentUser() user: AuthUser, @Query() pagination: PaginationDto) {
    return this.ratingsService.getGiven(user.sub, pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single rating by ID' })
  findOne(@Param('id') id: string) {
    return this.ratingsService.findOne(id);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Public ratings received by any user/merchant' })
  getByUser(
    @Param('userId') userId: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.ratingsService.getByUser(userId, pagination);
  }

  // ─── Flags ────────────────────────────────────────────────────────────────

  @Post(':id/flag')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Flag an abusive or false rating (reviewed party only)',
  })
  flagRating(
    @Param('id') ratingId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: FlagRatingDto,
  ) {
    return this.ratingsService.flagRating(ratingId, user.sub, dto);
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  @Get('admin/ratings')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] List all ratings' })
  getAllRatings(@Query() pagination: PaginationDto) {
    return this.ratingsService.getAllRatings(pagination);
  }

  @Get('admin/flags')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] List flags — filter by status' })
  @ApiQuery({ name: 'status', enum: FlagStatus, required: false })
  getFlags(
    @Query() pagination: PaginationDto,
    @Query('status') status?: FlagStatus,
  ) {
    return this.ratingsService.getFlags(pagination, status);
  }

  @Patch('admin/flags/:flagId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Dismiss or remove a flagged rating' })
  resolveFlag(@Param('flagId') flagId: string, @Body() dto: ReviewFlagDto) {
    return this.ratingsService.resolveFlag(flagId, dto);
  }
}
