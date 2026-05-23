import { Injectable, Logger } from '@nestjs/common';

import {
  ProductsService,
  ProductFilters,
  ProductStats,
} from '../../products/products.service';
import { NotificationsService } from '../../notifications/services/notifications.service';

import { NotificationType } from 'src/common/enums/notification.enum';
import { PaginationDto } from '../../../common/dto/pagination.dto';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DeactivatePayload {
  adminId: string;
  reason: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AdminProductsService {
  private readonly logger = new Logger(AdminProductsService.name);

  constructor(
    private readonly productsService: ProductsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ── Queries ────────────────────────────────────────────────────────────────

  async getAllProducts(
    pagination: PaginationDto,
    filters: ProductFilters = {},
  ) {
    return this.productsService.findAllAdmin(pagination, filters);
  }

  async getProduct(id: string) {
    return this.productsService.findOneAdmin(id);
  }

  async getLiveAuctions(pagination: PaginationDto) {
    return this.productsService.getLiveAuctions(pagination);
  }

  async getStats(): Promise<ProductStats> {
    return this.productsService.getStats();
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  /**
   * Deactivates a product listing.
   * Delegates state change to ProductsService, then notifies the merchant.
   * Notification lives here (not in ProductsService) because deactivation
   * is an admin-only action — merchant-side mutations have their own
   * notification patterns.
   */
  async deactivateProduct(id: string, payload: DeactivatePayload) {
    const product = await this.productsService.deactivate(
      id,
      payload.adminId,
      payload.reason,
    );

    await this.notificationsService.notify(product.merchantId, {
      type: NotificationType.PRODUCT_DEACTIVATED,
      title: 'Product deactivated by admin',
      body: `"${product.name}" has been deactivated. Reason: ${payload.reason}`,
      titleAr: 'تم تعطيل المنتج من قِبل الإدارة',
      bodyAr: `تم تعطيل "${product.name}". السبب: ${payload.reason}`,
      referenceType: 'product',
      referenceId: product.id,
    });

    this.logger.warn(
      `Product deactivated [id=${id}] by admin [${payload.adminId}]`,
    );

    return product;
  }

  /**
   * Reactivates a previously deactivated product.
   * Notifies merchant so they know their listing is live again.
   */
  async reactivateProduct(id: string, adminId: string) {
    const product = await this.productsService.reactivate(id, adminId);

    await this.notificationsService.notify(product.merchantId, {
      type: NotificationType.PRODUCT_REACTIVATED,
      title: 'Product reactivated ✅',
      body: `"${product.name}" is now active and visible to buyers.`,
      titleAr: 'تمت إعادة تفعيل المنتج ✅',
      bodyAr: `"${product.name}" نشط الآن ومرئي للمشترين.`,
      referenceType: 'product',
      referenceId: product.id,
    });

    this.logger.log(`Product reactivated [id=${id}] by admin [${adminId}]`);

    return product;
  }
}
