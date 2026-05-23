import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// ─── Entities ────────────────────────────────────────────────────────────────
import { Farm } from '../farms/entities/farm.entity';
import { WithdrawalRequest } from '../wallet/entities/wallet.entity';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Product } from '../products/entities/product.entity';
import { AdminAuditLog } from './entities/admin-audit-log.entity'; // ← NEW

// ─── Domain modules ───────────────────────────────────────────────────────────
import { FarmsModule } from '../farms/farms.module';
import { WalletModule } from '../wallet/wallet.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';

// ─── Services ─────────────────────────────────────────────────────────────────
import { AdminDashboardService } from './services/admin-dashboard.service';
import { AdminFarmsService } from './services/admin-farms.service';
import { AdminWithdrawalsService } from './services/admin-withdrawals.service';
import { AdminUsersService } from './services/admin-users.service';
import { AdminOrdersService } from './services/admin-orders.service';
import { AdminProductsService } from './services/admin-products.service';
import { AdminReportsService } from './services/admin-reports.service';
import { AdminNotificationsService } from './services/admin-notifications.service';
import { AdminAuditService } from './services/admin-audit.service';

// ─── Controllers ──────────────────────────────────────────────────────────────
import { AdminDashboardController } from './controllers/admin-dashboard.controller';
import { AdminFarmsController } from './controllers/admin-farms.controller';
import { AdminWithdrawalsController } from './controllers/admin-withdrawals.controller';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminOrdersController } from './controllers/admin-orders.controller';
import { AdminProductsController } from './controllers/admin-products.controller';
import { AdminReportsController } from './controllers/admin-reports.controller';
import { AdminNotificationsController } from './controllers/admin-notifications.controller';
import { AdminAuditController } from './controllers/admin-audit.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Farm,
      WithdrawalRequest,
      User,
      Order,
      Payment,
      Product,
      AdminAuditLog,
    ]),

    FarmsModule,
    WalletModule,
    UsersModule,
    OrdersModule,
    ProductsModule,
    NotificationsModule,
  ],

  providers: [
    AdminDashboardService,
    AdminFarmsService,
    AdminWithdrawalsService,
    AdminUsersService,
    AdminOrdersService,
    AdminProductsService,
    AdminReportsService,
    AdminNotificationsService,
    AdminAuditService,
  ],

  controllers: [
    AdminDashboardController,
    AdminFarmsController,
    AdminWithdrawalsController,
    AdminUsersController,
    AdminOrdersController,
    AdminProductsController,
    AdminReportsController,
    AdminNotificationsController,
    AdminAuditController,
  ],
})
export class AdminModule {}
