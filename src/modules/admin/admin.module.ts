import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// ─── Entities ────────────────────────────────────────────────────────────────
import { Farm } from '../farms/entities/farm.entity';
import { WithdrawalRequest } from '../wallet/entities/wallet.entity';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Product } from '../products/entities/product.entity';

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

// ─── Controllers ──────────────────────────────────────────────────────────────
import { AdminDashboardController } from './controllers/admin-dashboard.controller';
import { AdminFarmsController } from './controllers/admin-farms.controller';
import { AdminWithdrawalsController } from './controllers/admin-withdrawals.controller';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminOrdersController } from './controllers/admin-orders.controller';
import { AdminProductsController } from './controllers/admin-products.controller';
import { AdminReportsController } from './controllers/admin-reports.controller';
import { AdminNotificationsController } from './controllers/admin-notifications.controller';

@Module({
  imports: [
    // Register all entities this module queries directly.
    // Entities owned by other modules are accessed through
    // their exported services — not duplicated here.
    TypeOrmModule.forFeature([
      Farm,
      WithdrawalRequest,
      User,
      Order,
      Payment,
      Product,
    ]),

    // Domain modules — provide their exported services
    FarmsModule,        // FarmsService (approve/reject logic)
    WalletModule,       // WalletService (processWithdrawal)
    UsersModule,        // UsersService (if needed downstream)
    OrdersModule,       // OrdersService (relations, entity access)
    ProductsModule,     // ProductsService (relations)
    NotificationsModule, // NotificationsService (notify/broadcast)
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
  ],
})
export class AdminModule {}
