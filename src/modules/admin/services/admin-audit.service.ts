import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AdminAuditLog } from '../entities/admin-audit-log.entity';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { paginate } from '../../../shared/pagination/pagination.helper';

export interface AuditEntry {
  adminId: string;
  adminPhone?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  reason?: string;
  meta?: Record<string, unknown>;
}

@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);

  constructor(
    @InjectRepository(AdminAuditLog)
    private readonly auditRepo: Repository<AdminAuditLog>,
  ) {}

  /**
   * Write a single audit entry.
   * Fire-and-forget — never throws so it cannot break a parent transaction.
   */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.auditRepo.save(this.auditRepo.create(entry));
    } catch (err) {
      // Audit failure must never block the primary operation
      this.logger.error('Failed to write audit log', err);
    }
  }

  // ── Queries (for Admin UI — "Activity Log" screen) ─────────────────

  async getLogs(
    pagination: PaginationDto,
    filters: {
      adminId?: string;
      resourceType?: string;
      resourceId?: string;
      action?: string;
      from?: string;
      to?: string;
    } = {},
  ) {
    const qb = this.auditRepo
      .createQueryBuilder('a')
      .orderBy('a.createdAt', 'DESC');

    if (filters.adminId)
      qb.andWhere('a.adminId = :adminId', { adminId: filters.adminId });

    if (filters.resourceType)
      qb.andWhere('a.resourceType = :resourceType', {
        resourceType: filters.resourceType,
      });

    if (filters.resourceId)
      qb.andWhere('a.resourceId = :resourceId', {
        resourceId: filters.resourceId,
      });

    if (filters.action)
      qb.andWhere('a.action = :action', { action: filters.action });

    if (filters.from)
      qb.andWhere('a.createdAt >= :from', { from: filters.from });

    if (filters.to) qb.andWhere('a.createdAt <= :to', { to: filters.to });

    return paginate(qb, Number(pagination.page), Number(pagination.limit));
  }

  async getLogsForResource(resourceType: string, resourceId: string) {
    return this.auditRepo.find({
      where: { resourceType, resourceId },
      order: { createdAt: 'DESC' },
    });
  }
}
