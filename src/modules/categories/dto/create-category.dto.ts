import {
  IsString,
  IsOptional,
  IsUUID,
  IsInt,
  IsBoolean,
  Min,
  MinLength,
  MaxLength,
  Matches,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from 'src/common/dto/pagination.dto';

export class CreateCategoryDto {
  @ApiProperty({ example: 'خضروات', description: 'Arabic name' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  nameAr: string;

  @ApiProperty({ example: 'Vegetables', description: 'English name' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  nameEn: string;

  @ApiPropertyOptional({
    example: 'vegetables',
    description:
      'URL-safe slug — auto-generated from nameEn if omitted. ' +
      'Lowercase letters, numbers, and hyphens only.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase letters, numbers, and hyphens only',
  })
  slug?: string;

  @ApiPropertyOptional({
    example: null,
    description:
      'Parent category UUID — omit or pass null to create a top-level category',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional({ example: 1, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CategoryFilterDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter by parent UUID. Pass "null" for top-level only.',
  })
  @IsOptional()
  @ValidateIf((o) => o.parentId !== 'null')
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(
    ({ obj }) => {
      const raw = obj.isActive;
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      return undefined;
    },
    { toClassOnly: true },
  )
  @IsBoolean()
  isActive?: boolean;
}
