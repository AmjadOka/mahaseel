import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsArray,
  IsIn,
  MinLength,
  IsDateString,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType } from 'src/common/enums/notification.enum';
import { Role } from 'src/common/enums/role.enum';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import { Type } from 'class-transformer';

// ─── Farms ───────────────────────────────────────────────────────────────────

export class RejectFarmDto {
  @ApiProperty({ description: 'Reason shown to the merchant', minLength: 5 })
  @IsString()
  @MinLength(5)
  reason: string;
}

// ─── Withdrawals ──────────────────────────────────────────────────────────────

export class ProcessWithdrawalDto {
  @ApiProperty({ enum: ['complete', 'reject'] })
  @IsIn(['complete', 'reject'])
  action: 'complete' | 'reject';

  @ApiPropertyOptional({
    description: 'Optional admin note — stored on the request and in audit log',
  })
  @IsOptional()
  @IsString()
  adminNotes?: string;
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export class ForceOrderActionDto {
  @ApiPropertyOptional({ description: 'Admin note for audit trail' })
  @IsOptional()
  @IsString()
  reason?: string;
}

// ─── Products ─────────────────────────────────────────────────────────────────

export class DeactivateProductDto {
  @ApiProperty({ minLength: 5 })
  @IsString()
  @MinLength(5)
  reason: string;
}

// ─── Ratings ──────────────────────────────────────────────────────────────────

export class RemoveRatingDto {
  @ApiProperty({ minLength: 5 })
  @IsString()
  @MinLength(5)
  reason: string;
}

// ─── Broadcast Notification ──────────────────────────────────────────────────

export class BroadcastNotificationDto {
  @ApiPropertyOptional({
    description: 'Target specific user IDs — if omitted, targets by role',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  userIds?: string[];

  @ApiPropertyOptional({
    description: 'Target all users of this role — ignored when userIds is set',
    enum: Role,
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiProperty({ minLength: 2 })
  @IsString()
  @MinLength(2)
  title: string;

  @ApiProperty({ minLength: 2 })
  @IsString()
  @MinLength(2)
  body: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  titleAr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bodyAr?: string;
}

// ─── Date Range (shared across Reports / Orders / Withdrawals query params) ───

/**
 * Use as @Query() on any endpoint that accepts from/to date filters.
 * Validates ISO format before it ever reaches service or SQL.
 *
 * Example: GET /admin/reports/revenue?from=2025-01-01&to=2025-12-31
 */
export class DateRangeDto {
  @ApiPropertyOptional({
    example: '2025-01-01',
    description: 'ISO 8601 date (inclusive start)',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    example: '2025-12-31',
    description: 'ISO 8601 date (inclusive end)',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}

// ─── Audit Log Query ──────────────────────────────────────────────────────────

export class AuditLogQueryDto extends DateRangeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  adminId?: string;

  @ApiPropertyOptional({ example: 'user' })
  @IsOptional()
  @IsString()
  resourceType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  resourceId?: string;

  @ApiPropertyOptional({ example: 'SUSPEND_USER' })
  @IsOptional()
  @IsString()
  action?: string;
}

// ─── Suspend User ─────────────────────────────────────────────────────────────

export class SuspendUserDto {
  @ApiPropertyOptional({
    description: 'Reason communicated to the user in the notification',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
export class AdminUsersQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
