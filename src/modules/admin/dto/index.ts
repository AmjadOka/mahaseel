import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsArray,
  IsIn,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType } from 'src/common/enums/notification.enum';
import { Role } from 'src/common/enums/role.enum';

// ─── Farms ───────────────────────────────────────────────────────────────────

export class RejectFarmDto {
  @ApiProperty({ description: 'Reason shown to the merchant' })
  @IsString()
  @MinLength(5)
  reason: string;
}

// ─── Withdrawals ──────────────────────────────────────────────────────────────

export class ProcessWithdrawalDto {
  @ApiProperty({ enum: ['complete', 'reject'] })
  @IsIn(['complete', 'reject'])
  action: 'complete' | 'reject';

  @ApiPropertyOptional()
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
  @ApiProperty()
  @IsString()
  @MinLength(5)
  reason: string;
}

// ─── Ratings ──────────────────────────────────────────────────────────────────

export class RemoveRatingDto {
  @ApiProperty()
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

  @ApiProperty()
  @IsString()
  @MinLength(2)
  title: string;

  @ApiProperty()
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
