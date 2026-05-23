import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Farm } from '../../farms/entities/farm.entity';
import {
  ApprovalPayload,
  FarmsService,
  RejectionPayload,
} from '../../farms/farms.service';

import { FarmStatus } from 'src/common/enums/farm.enum';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { paginate } from '../../../shared/pagination/pagination.helper';

@Injectable()
export class AdminFarmsService {
  constructor(
    @InjectRepository(Farm) private readonly farmsRepo: Repository<Farm>,
    private readonly farmsService: FarmsService,
  ) {}

  // ── Queries ────────────────────────────────────────────────────────────────

  async getPendingFarms(pagination: PaginationDto) {
    const qb = this.farmsRepo
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.owner', 'owner')
      .where('f.status = :status', { status: FarmStatus.PENDING })
      .andWhere('f.isDeleted = false')
      .orderBy('f.createdAt', 'ASC'); // oldest first → review queue order
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

  // Notification is already sent inside FarmsService.approveFarm —

  async approveFarm(id: string, payload: ApprovalPayload) {
    return this.farmsService.approveFarm(id, payload);
  }

  async rejectFarm(id: string, payload: RejectionPayload) {
    return this.farmsService.rejectFarm(id, payload);
  }

  async suspendFarm(id: string, payload: RejectionPayload) {
    return this.farmsService.suspendFarm(id, payload);
  }

  async unsuspendFarm(id: string, payload: ApprovalPayload) {
    return this.farmsService.unsuspendFarm(id, payload);
  }

  async hardDelete(id: string, adminId: string) {
    return this.farmsService.hardDelete(id, adminId);
  }
}
