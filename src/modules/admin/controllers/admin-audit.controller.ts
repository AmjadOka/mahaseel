import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { AdminAuditService } from '../services/admin-audit.service';
import { AuditLogQueryDto } from '../dto/index';
import { PaginationDto } from '../../../common/dto/pagination.dto';

@ApiTags('Admin — Audit Log')
@Controller('admin/audit')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AdminAuditController {
  constructor(private readonly auditService: AdminAuditService) {}

  @Get()
  @ApiOperation({
    summary:
      '[Admin] Paginated audit log — filterable by admin, resource, action, date',
  })
  getLogs(
    @Query() pagination: PaginationDto,
    @Query() filters: AuditLogQueryDto,
  ) {
    return this.auditService.getLogs(pagination, filters);
  }

  @Get(':resourceType/:resourceId')
  @ApiOperation({
    summary:
      '[Admin] Full history for a specific resource (user, order, farm…)',
  })
  getResourceHistory(
    @Param('resourceType') resourceType: string,
    @Param('resourceId', ParseUUIDPipe) resourceId: string,
  ) {
    return this.auditService.getLogsForResource(resourceType, resourceId);
  }
}
