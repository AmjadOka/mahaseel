import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Farm } from '../../farms/entities/farm.entity';
import {
  ApprovalPayload,
  FarmsService,
  RejectionPayload,
} from '../../farms/farms.service';
import { AdminAuditService } from './admin-audit.service';

import { FarmStatus } from 'src/common/enums/farm.enum';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { paginate } from '../../../shared/pagination/pagination.helper';

@Injectable()
export class AdminFarmsService {
  constructor(
    @InjectRepository(Farm) private readonly farmsRepo: Repository<Farm>,
    private readonly farmsService: FarmsService,
    private readonly auditService: AdminAuditService,
  ) {}

  // ── Queries ────────────────────────────────────────────────────────────────

  async getPendingFarms(pagination: PaginationDto) {
    const qb = this.farmsRepo
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.owner', 'owner')
      .where('f.status = :status', { status: FarmStatus.PENDING })
      .andWhere('f.isDeleted = false')
      .orderBy('f.createdAt', 'ASC');
    return paginate(qb, Number(pagination.page), Number(pagination.limit));
  }

  async getAllFarms(
    pagination: PaginationDto,
    status?: FarmStatus,
    search?: string,
  ) {
    const qb = this.farmsRepo
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.owner', 'owner')
      .where('f.isDeleted = false')
      .orderBy('f.createdAt', 'DESC');

    if (status) qb.andWhere('f.status = :status', { status });
    if (search) {
      qb.andWhere('(f.name ILIKE :q OR f.location ILIKE :q)', {
        q: `%${search}%`,
      });
    }

    return paginate(qb, Number(pagination.page), Number(pagination.limit));
  }

  async getFarmById(id: string) {
    return this.farmsService.findOne(id);
  }

  async getStats(ownerId?: string) {
    return this.farmsService.getStats(ownerId);
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  async approveFarm(id: string, payload: ApprovalPayload) {
    const farm = await this.farmsService.findOne(id);

    if (farm.status !== FarmStatus.PENDING) {
      throw new ConflictException(
        `Farm is already ${farm.status} and cannot be approved again.`,
      );
    }

    const result = await this.farmsService.approveFarm(id, payload);

    await this.auditService.log({
      adminId: payload.adminId,
      action: 'APPROVE_FARM',
      resourceType: 'farm',
      resourceId: id,
      meta: { farmName: farm.name, ownerId: farm.ownerId },
    });

    return result;
  }

  async rejectFarm(id: string, payload: RejectionPayload) {
    const farm = await this.farmsService.findOne(id);

    if (farm.status !== FarmStatus.PENDING) {
      throw new ConflictException(
        `Farm is already ${farm.status} and cannot be rejected again.`,
      );
    }

    const result = await this.farmsService.rejectFarm(id, payload);

    await this.auditService.log({
      adminId: payload.adminId,
      action: 'REJECT_FARM',
      resourceType: 'farm',
      resourceId: id,
      reason: payload.reason,
      meta: { farmName: farm.name, ownerId: farm.ownerId },
    });

    return result;
  }

  async suspendFarm(id: string, payload: RejectionPayload) {
    const result = await this.farmsService.suspendFarm(id, payload);

    await this.auditService.log({
      adminId: payload.adminId,
      action: 'SUSPEND_FARM',
      resourceType: 'farm',
      resourceId: id,
      reason: payload.reason,
    });

    return result;
  }

  async unsuspendFarm(id: string, payload: ApprovalPayload) {
    const result = await this.farmsService.unsuspendFarm(id, payload);

    await this.auditService.log({
      adminId: payload.adminId,
      action: 'UNSUSPEND_FARM',
      resourceType: 'farm',
      resourceId: id,
    });

    return result;
  }

  async hardDelete(id: string, adminId: string) {
    const farm = await this.farmsService.findOne(id);
    const result = await this.farmsService.hardDelete(id, adminId);

    await this.auditService.log({
      adminId,
      action: 'HARD_DELETE_FARM',
      resourceType: 'farm',
      resourceId: id,
      meta: { farmName: farm.name, ownerId: farm.ownerId },
    });

    return result;
  }
}
