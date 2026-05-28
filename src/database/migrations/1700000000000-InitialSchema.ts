import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ENUMs
    await queryRunner.query(
      `CREATE TYPE "role_enum" AS ENUM('merchant', 'buyer', 'admin')`,
    );
    await queryRunner.query(
      `CREATE TYPE "farm_status_enum" AS ENUM('pending', 'approved', 'rejected')`,
    );
    await queryRunner.query(
      `CREATE TYPE "sale_method_enum" AS ENUM('fixed', 'auction')`,
    );
    await queryRunner.query(
      `CREATE TYPE "unit_enum" AS ENUM('kg', 'ton', 'head', 'box', 'piece')`,
    );
    await queryRunner.query(
      `CREATE TYPE "delivery_method_enum" AS ENUM('from_farm', 'driver')`,
    );
    await queryRunner.query(
      `CREATE TYPE "product_status_enum" AS ENUM('draft', 'active', 'sold', 'expired')`,
    );
    await queryRunner.query(
      `CREATE TYPE "order_status_enum" AS ENUM('pending_merchant','accepted','rejected','preparing','in_delivery','ready_pickup','delivered','completed','cancelled')`,
    );
    await queryRunner.query(
      `CREATE TYPE "bid_status_enum" AS ENUM('active', 'withdrawn', 'won', 'lost')`,
    );
    await queryRunner.query(
      `CREATE TYPE "payment_status_enum" AS ENUM('pending', 'paid', 'failed', 'refunded')`,
    );
    await queryRunner.query(
      `CREATE TYPE "withdrawal_status_enum" AS ENUM('pending', 'processing', 'completed', 'rejected')`,
    );
    await queryRunner.query(
      `CREATE TYPE "wallet_tx_type_enum" AS ENUM('credit', 'debit')`,
    );
    await queryRunner.query(
      `CREATE TYPE "wallet_tx_reason_enum" AS ENUM('order_earning','balance_release','withdrawal','withdrawal_rejected','platform_fee')`,
    );
    await queryRunner.query(
      `CREATE TYPE "media_type_enum" AS ENUM('image', 'video')`,
    );
    await queryRunner.query(
      `CREATE TYPE "platform_enum" AS ENUM('ios', 'android')`,
    );
    await queryRunner.query(
      `CREATE TYPE "notification_type_enum" AS ENUM('order_placed','order_accepted','order_rejected','order_status_changed','bid_placed','auction_won','auction_lost','payment_required','payment_received','withdrawal_processed','farm_approved','farm_rejected','rating_received')`,
    );

    // USERS
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "role" "role_enum" NOT NULL DEFAULT 'buyer',
        "full_name" VARCHAR(100) NOT NULL,
        "phone" VARCHAR(20) UNIQUE NOT NULL,
        "profile_image" VARCHAR,
        "rating_avg" DECIMAL(3,2) DEFAULT 0,
        "rating_count" INT DEFAULT 0,
        "is_active" BOOLEAN DEFAULT true,
        "is_deleted" BOOLEAN DEFAULT false,
        "deleted_at" TIMESTAMP,
        "refresh_token" VARCHAR,
        "created_at" TIMESTAMP DEFAULT now(),
        "updated_at" TIMESTAMP DEFAULT now()
      )
    `);

    // CATEGORIES
    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "name_ar" VARCHAR(100) NOT NULL,
        "name_en" VARCHAR(100),
        "slug" VARCHAR,
        "icon_url" VARCHAR,
        "parent_id" UUID REFERENCES "categories"("id"),
        "sort_order" INT DEFAULT 0,
        "is_active" BOOLEAN DEFAULT true
      )
    `);

    // FARMS
    await queryRunner.query(`
      CREATE TABLE "farms" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "owner_id" UUID NOT NULL REFERENCES "users"("id"),
        "name" VARCHAR(150) NOT NULL,
        "display_name" VARCHAR(150) NOT NULL,
        "manager_name" VARCHAR(100) NOT NULL,
        "contact_phone" VARCHAR(20) NOT NULL,
        "latitude" DECIMAL(10,8),
        "longitude" DECIMAL(11,8),
        "location_text" VARCHAR,
        "ag_registry_no" VARCHAR,
        "ag_registry_url" VARCHAR,
        "status" "farm_status_enum" NOT NULL DEFAULT 'pending',
        "rejection_reason" TEXT,
        "is_verified" BOOLEAN DEFAULT false,
        "is_deleted" BOOLEAN DEFAULT false,
        "deleted_at" TIMESTAMP,
        "created_at" TIMESTAMP DEFAULT now(),
        "updated_at" TIMESTAMP DEFAULT now()
      )
    `);

    // PRODUCTS
    await queryRunner.query(`
      CREATE TABLE "products" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "farm_id" UUID NOT NULL REFERENCES "farms"("id"),
        "category_id" UUID REFERENCES "categories"("id"),
        "merchant_id" UUID NOT NULL REFERENCES "users"("id"),
        "name" VARCHAR(200) NOT NULL,
        "description" TEXT,
        "quantity" DECIMAL(12,3) NOT NULL,
        "unit" "unit_enum" NOT NULL DEFAULT 'kg',
        "sale_method" "sale_method_enum" NOT NULL,
        "fixed_price" DECIMAL(12,2),
        "auction_start_price" DECIMAL(12,2),
        "auction_end_at" TIMESTAMP,
        "current_bid" DECIMAL(12,2),
        "status" "product_status_enum" NOT NULL DEFAULT 'draft',
        "delivery_method" "delivery_method_enum" NOT NULL DEFAULT 'from_farm',
        "driver_name" VARCHAR,
        "driver_phone" VARCHAR,
        "is_deleted" BOOLEAN DEFAULT false,
        "deleted_at" TIMESTAMP,
        "created_at" TIMESTAMP DEFAULT now(),
        "updated_at" TIMESTAMP DEFAULT now()
      )
    `);

    // PRODUCT MEDIA
    await queryRunner.query(`
      CREATE TABLE "product_media" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "product_id" UUID NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
        "url" VARCHAR NOT NULL,
        "media_type" "media_type_enum" NOT NULL DEFAULT 'image',
        "sort_order" INT DEFAULT 0,
        "created_at" TIMESTAMP DEFAULT now()
      )
    `);

    // ORDERS
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "product_id" UUID NOT NULL REFERENCES "products"("id"),
        "merchant_id" UUID NOT NULL REFERENCES "users"("id"),
        "buyer_id" UUID NOT NULL REFERENCES "users"("id"),
        "sale_method" "sale_method_enum" NOT NULL,
        "offered_price" DECIMAL(12,2) NOT NULL,
        "final_price" DECIMAL(12,2),
        "platform_fee" DECIMAL(12,2),
        "net_amount" DECIMAL(12,2),
        "quantity" DECIMAL(12,3) NOT NULL,
        "unit" "unit_enum" NOT NULL,
        "delivery_method" "delivery_method_enum" NOT NULL,
        "status" "order_status_enum" NOT NULL DEFAULT 'pending_merchant',
        "notes" TEXT,
        "rejection_reason" TEXT,
        "buyer_phone_revealed" BOOLEAN DEFAULT false,
        "created_at" TIMESTAMP DEFAULT now(),
        "updated_at" TIMESTAMP DEFAULT now()
      )
    `);

    // AUCTION BIDS
    await queryRunner.query(`
      CREATE TABLE "auction_bids" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "product_id" UUID NOT NULL REFERENCES "products"("id"),
        "buyer_id" UUID NOT NULL REFERENCES "users"("id"),
        "amount" DECIMAL(12,2) NOT NULL,
        "status" "bid_status_enum" NOT NULL DEFAULT 'active',
        "ip_address" VARCHAR,
        "created_at" TIMESTAMP DEFAULT now()
      )
    `);
    // Prevent duplicate active bids per buyer per product
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_active_bid_per_buyer_product"
      ON "auction_bids" ("product_id", "buyer_id")
      WHERE status = 'active'
    `);

    // PAYMENTS
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_id" UUID UNIQUE NOT NULL REFERENCES "orders"("id"),
        "buyer_id" UUID NOT NULL REFERENCES "users"("id"),
        "amount" DECIMAL(12,2) NOT NULL,
        "currency" VARCHAR DEFAULT 'SAR',
        "status" "payment_status_enum" NOT NULL DEFAULT 'pending',
        "payment_gateway" VARCHAR DEFAULT 'stripe',
        "gateway_ref" VARCHAR,
        "gateway_url" VARCHAR,
        "paid_at" TIMESTAMP,
        "created_at" TIMESTAMP DEFAULT now()
      )
    `);

    // WALLETS
    await queryRunner.query(`
      CREATE TABLE "wallets" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "merchant_id" UUID UNIQUE NOT NULL REFERENCES "users"("id"),
        "available_balance" DECIMAL(12,2) DEFAULT 0,
        "pending_balance" DECIMAL(12,2) DEFAULT 0,
        "total_earned" DECIMAL(12,2) DEFAULT 0,
        "updated_at" TIMESTAMP DEFAULT now()
      )
    `);

    // WALLET TRANSACTIONS
    await queryRunner.query(`
      CREATE TABLE "wallet_transactions" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "wallet_id" UUID NOT NULL REFERENCES "wallets"("id"),
        "type" "wallet_tx_type_enum" NOT NULL,
        "amount" DECIMAL(12,2) NOT NULL,
        "balance_after" DECIMAL(12,2) NOT NULL,
        "reason" "wallet_tx_reason_enum" NOT NULL,
        "reference_id" UUID,
        "description" VARCHAR,
        "created_at" TIMESTAMP DEFAULT now()
      )
    `);

    // BANK ACCOUNTS
    await queryRunner.query(`
      CREATE TABLE "bank_accounts" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "merchant_id" UUID NOT NULL REFERENCES "users"("id"),
        "bank_name" VARCHAR NOT NULL,
        "account_number" VARCHAR NOT NULL,
        "account_holder" VARCHAR NOT NULL,
        "iban" VARCHAR,
        "is_verified" BOOLEAN DEFAULT false,
        "is_default" BOOLEAN DEFAULT false,
        "created_at" TIMESTAMP DEFAULT now()
      )
    `);

    // WITHDRAWAL REQUESTS
    await queryRunner.query(`
      CREATE TABLE "withdrawal_requests" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "merchant_id" UUID NOT NULL REFERENCES "users"("id"),
        "bank_account_id" UUID NOT NULL REFERENCES "bank_accounts"("id"),
        "amount" DECIMAL(12,2) NOT NULL,
        "notes" TEXT,
        "status" "withdrawal_status_enum" NOT NULL DEFAULT 'pending',
        "admin_notes" TEXT,
        "processed_at" TIMESTAMP,
        "created_at" TIMESTAMP DEFAULT now()
      )
    `);

    // RATINGS
    await queryRunner.query(`
      CREATE TABLE "ratings" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_id" UUID UNIQUE NOT NULL REFERENCES "orders"("id"),
        "reviewer_id" UUID NOT NULL REFERENCES "users"("id"),
        "reviewed_id" UUID NOT NULL REFERENCES "users"("id"),
        "score" INT NOT NULL CHECK (score BETWEEN 1 AND 5),
        "comment" TEXT,
        "created_at" TIMESTAMP DEFAULT now()
      )
    `);

    // NOTIFICATIONS
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL REFERENCES "users"("id"),
        "type" "notification_type_enum" NOT NULL,
        "title_ar" VARCHAR NOT NULL,
        "body_ar" TEXT NOT NULL,
        "reference_type" VARCHAR,
        "reference_id" UUID,
        "is_read" BOOLEAN DEFAULT false,
        "created_at" TIMESTAMP DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_user_unread" ON "notifications" ("user_id", "is_read")`,
    );

    // FCM TOKENS
    await queryRunner.query(`
      CREATE TABLE "fcm_tokens" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL REFERENCES "users"("id"),
        "token" VARCHAR UNIQUE NOT NULL,
        "platform" "platform_enum" NOT NULL,
        "updated_at" TIMESTAMP DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'fcm_tokens',
      'notifications',
      'ratings',
      'withdrawal_requests',
      'bank_accounts',
      'wallet_transactions',
      'wallets',
      'payments',
      'auction_bids',
      'orders',
      'product_media',
      'products',
      'farms',
      'categories',
      'users',
    ];
    for (const table of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
    }
    const enums = [
      'role_enum',
      'farm_status_enum',
      'sale_method_enum',
      'unit_enum',
      'delivery_method_enum',
      'product_status_enum',
      'order_status_enum',
      'bid_status_enum',
      'payment_status_enum',
      'withdrawal_status_enum',
      'wallet_tx_type_enum',
      'wallet_tx_reason_enum',
      'media_type_enum',
      'platform_enum',
      'notification_type_enum',
    ];
    for (const e of enums) {
      await queryRunner.query(`DROP TYPE IF EXISTS "${e}"`);
    }
  }
}
