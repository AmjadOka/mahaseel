# Mahaseel — Technical Documentation

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Infrastructure Dependencies](#4-infrastructure-dependencies)
5. [Module Breakdown](#5-module-breakdown)
6. [Authentication & Authorization](#6-authentication--authorization)
7. [API Reference](#7-api-reference)
8. [Data Flow](#8-data-flow)
9. [Caching Strategy](#9-caching-strategy)
10. [Job Queues & Schedulers](#10-job-queues--schedulers)
11. [Notification System](#11-notification-system)
12. [File Uploads & Media](#12-file-uploads--media)
13. [Payment Flow](#13-payment-flow)
14. [Security](#14-security)
15. [Environment Variables](#15-environment-variables)

---

## 1. System Overview

**Mahaseel** (محصول) is a B2C agricultural marketplace platform connecting buyers directly with local farmers and merchants across Palestine and the surrounding region. The platform supports two primary sale models — fixed-price orders and live auctions — with an integrated wallet, payout, and real-time notification system.

### Core Roles

| Role       | Description                                                             |
| ---------- | ----------------------------------------------------------------------- |
| `BUYER`    | Browse products, place orders, bid in auctions, rate merchants          |
| `MERCHANT` | List products, manage farms, accept orders, request payouts             |
| `ADMIN`    | Approve farms, manage categories, process withdrawals, moderate ratings |

### Key Capabilities

- **Dual sale model** — fixed-price purchases and real-time sealed-bid auctions
- **Merchant wallet** — earnings held in a pending balance, released after buyer confirms delivery, withdrawable to a bank account
- **Multi-channel notifications** — in-app (WebSocket + SSE), email, SMS (planned)
- **Google OAuth** — alongside email/password with full token lifecycle management
- **Promotion flow** — buyers can request promotion to merchant, pending admin approval

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     NestJS Application                  │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │   Auth   │  │  Users   │  │  Farms   │  │Products│  │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │  Orders  │  │ Auctions │  │ Payments │  │ Wallet │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │Notif.    │  │ Ratings  │  │Categories│  │  Bank  │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │               Shared Infrastructure             │    │
│  │   Redis · BullMQ · Cloudinary · Stripe · Mail   │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
         │                │               │
    PostgreSQL           Redis         Cloudinary
```

The application follows a **modular monolith** architecture — each domain is a self-contained NestJS module with its own entity, service, controller, and DTOs. Cross-module communication is done via service injection (synchronous) or EventEmitter2 events (async, fire-and-forget).

---

## 3. Tech Stack

| Layer      | Technology                                           |
| ---------- | ---------------------------------------------------- |
| Framework  | NestJS (Fastify adapter)                             |
| Language   | TypeScript                                           |
| Database   | PostgreSQL via TypeORM                               |
| Cache      | Redis via `ioredis`                                  |
| Job Queues | BullMQ                                               |
| Auth       | JWT (access + refresh) · Passport · Google OAuth 2.0 |
| Payments   | Stripe Checkout                                      |
| Media      | Cloudinary                                           |
| Mail       | Nodemailer (SMTP)                                    |
| Real-time  | Socket.io (WebSocket) · SSE (Server-Sent Events)     |
| Validation | class-validator · class-transformer                  |
| API Docs   | Swagger / OpenAPI                                    |

---

## 4. Infrastructure Dependencies

| Service      | Purpose                                 | Required |
| ------------ | --------------------------------------- | -------- |
| PostgreSQL   | Primary data store                      | ✅       |
| Redis        | Caching · BullMQ broker · JWT blacklist | ✅       |
| Cloudinary   | Product / farm / avatar media storage   | ✅       |
| Stripe       | Payment processing · Webhooks           | ✅       |
| SMTP server  | Transactional email                     | ✅       |
| Google OAuth | Social login                            | Optional |

---

## 5. Module Breakdown

### Auth

Handles the complete authentication lifecycle.

- Email/password sign-up with email verification (6-digit OTP, 10-min TTL)
- Sign-in returning `accessToken` (1d) + `refreshToken` (30d)
- Token rotation on refresh
- Google OAuth 2.0 — tokens set as `httpOnly` cookies, redirect to frontend
- Logout (single device) — blacklists current access token in Redis (`bl:{jti}`)
- Logout all — increments `tokenVersion` on the user, busts auth cache
- Password reset — 3-step flow: send OTP → verify → change password
- Set password — for OAuth users who want to add a password

### Users

- Self-service profile: `fullName`, `bio`, avatar (Cloudinary)
- Public profile endpoint — safe fields only for unauthenticated callers
- Per-user stats: order counts, rating averages (raw SQL, cached 5 min)
- Promotion request: BUYER → MERCHANT (sets `promotionStatus = PENDING`)

### Farms

- Merchant-owned farm entities with media (images/videos via Cloudinary)
- Admin approval workflow: `PENDING → APPROVED / REJECTED`
- Soft-delete with cascade to products

### Products

Two sale methods, both on the same entity:

| Field               | Fixed Price | Auction             |
| ------------------- | ----------- | ------------------- |
| `saleMethod`        | `FIXED`     | `AUCTION`           |
| `fixedPrice`        | required    | —                   |
| `auctionStartPrice` | —           | required            |
| `auctionEndAt`      | —           | required            |
| `currentBid`        | —           | updated on each bid |

Product status flow: `DRAFT → ACTIVE → SOLD / EXPIRED`

### Market (Public)

- `GET /market` — paginated search with filters: `q`, `categoryId`, `saleMethod`, `priceMin`, `priceMax`, `location`, `unit`
- `GET /market/:id` — public product detail
- Backed by Redis version-key cache (2-min TTL, instant invalidation on mutation)

### Orders

Order status flow:

```
PENDING → ACCEPTED → IN_DELIVERY → DELIVERED → COMPLETED
        ↘ REJECTED
        ↘ CANCELLED (buyer, before acceptance)
```

On `ACCEPTED`: buyer phone revealed to merchant, payment link sent  
On `COMPLETED`: platform fee deducted, net amount credited to merchant pending balance

### Auctions

- Buyers place bids — must exceed `currentBid` or `auctionStartPrice`
- Bid withdrawal recalculates `currentBid` to next highest active bid
- Merchant accepts a bid → auction closes early, wallet credited
- IP address logged per bid (`select: false` — never returned to client)

### Payments

- Stripe Checkout session created on order acceptance
- Webhook handler processes `checkout.session.completed`
- BullMQ job cancels unpaid orders every 30 minutes
- `Payment` entity tracks gateway ref, status, `paidAt`

### Wallet

Three-balance model:

| Balance            | Description                                              |
| ------------------ | -------------------------------------------------------- |
| `pendingBalance`   | Funds held after order completion — not yet withdrawable |
| `availableBalance` | Released funds — withdrawable                            |
| `totalEarned`      | Cumulative lifetime earnings                             |

All balance mutations use `pessimistic_write` locks inside transactions.

### Bank Accounts

- Merchants can save multiple bank accounts
- One marked as `isDefault` at a time — atomic swap via transaction
- Default auto-promoted when the active default is deleted
- Used as target for withdrawal requests

### Withdrawals

- Merchant requests withdrawal against `availableBalance`
- Admin approves → `COMPLETED` + notification + email
- Admin rejects → refund to `availableBalance` + notification
- All state transitions guarded with pessimistic locks to prevent double-processing

### Categories

- Hierarchical (parent → children, unlimited depth)
- Admin-managed: CRUD, icon upload/removal, toggle active
- Public read, no auth required
- Slug auto-generated from `nameEn` if not provided

### Ratings

- Both buyer and merchant can rate after order completion (`@Unique(['orderId', 'reviewerId'])`)
- Score 1–5 with DB-level `CHECK` constraint
- Rating flags: users can report abusive ratings
- Admin resolves flags: `REVIEWED / DISMISSED / REMOVED`
- Removing a rating recalculates the user's `ratingAvg` and `ratingCount`

### Notifications

See [Section 11](#11-notification-system) for full detail.

---

## 6. Authentication & Authorization

### Token Architecture

```
Access Token  — JWT, 1d TTL, signed with JWT_ACCESS_SECRET
Refresh Token — JWT, 30d TTL, signed with JWT_REFRESH_SECRET, hashed in DB
```

Each token carries:

```typescript
{
  sub: string; // userId
  role: Role;
  email: string;
  tokenVersion: number;
  type: 'access' | 'refresh';
  jti: string; // UUID, unique per token
}
```

### Validation Flow (JwtStrategy)

```
1. Extract Bearer token
2. Check bl:{jti} in Redis → reject if blacklisted
3. Check auth_user:{sub} in Redis → use cached user (60s TTL)
4. DB fallback → verify isActive, isDeleted
5. Validate tokenVersion matches payload
6. Cache sanitized user for 60s
```

### Guards

| Guard             | Purpose                                             |
| ----------------- | --------------------------------------------------- |
| `JwtAuthGuard`    | Validates access token, populates `req.user`        |
| `RolesGuard`      | Checks `@Roles()` decorator against `req.user.role` |
| `AdminGuard`      | Role check + `x-admin-secret` header validation     |
| `GoogleAuthGuard` | Passport Google OAuth strategy                      |

### Google OAuth Flow

```
Browser → GET /auth/google
        → Google consent screen
        → GET /auth/google/callback
        → tokens set as httpOnly cookies
        → redirect to {FRONTEND_URL}/auth/success
```

---

## 7. API Reference

### Auth — `/auth`

| Method | Endpoint                 | Auth   | Description                    |
| ------ | ------------------------ | ------ | ------------------------------ |
| POST   | `/signup`                | Public | Register with email + password |
| POST   | `/verify-email`          | Public | Verify 6-digit OTP             |
| POST   | `/resend-verification`   | Public | Re-send verification OTP       |
| POST   | `/signin`                | Public | Sign in, returns tokens        |
| POST   | `/refresh`               | Public | Rotate tokens                  |
| GET    | `/google`                | Public | Google OAuth redirect          |
| GET    | `/google/callback`       | Public | OAuth callback                 |
| POST   | `/set-password`          | JWT    | Set password for OAuth users   |
| POST   | `/logout`                | JWT    | Blacklist current token        |
| POST   | `/logout-all`            | JWT    | Invalidate all sessions        |
| POST   | `/reset/send-code`       | Public | Send password reset OTP        |
| POST   | `/reset/verify`          | Public | Verify reset OTP               |
| POST   | `/reset/change-password` | Public | Set new password               |

### Users — `/users`

| Method | Endpoint                        | Auth   | Description                |
| ------ | ------------------------------- | ------ | -------------------------- |
| GET    | `/users/:id/profile`            | Public | Public profile             |
| GET    | `/users/:id/stats`              | Public | Order + rating stats       |
| GET    | `/users/me`                     | JWT    | Own full profile           |
| PATCH  | `/users/me`                     | JWT    | Update name / bio          |
| PATCH  | `/users/me/avatar`              | JWT    | Upload avatar              |
| DELETE | `/users/me/avatar`              | JWT    | Remove avatar              |
| PATCH  | `/users/me/promote-to-merchant` | JWT    | Request merchant promotion |

### Products — `/products` (Merchant) · `/market` (Public)

| Method | Endpoint                       | Auth     | Description          |
| ------ | ------------------------------ | -------- | -------------------- |
| GET    | `/products`                    | Merchant | Own product list     |
| POST   | `/products`                    | Merchant | Create product       |
| GET    | `/products/:id`                | Merchant | Product detail       |
| PATCH  | `/products/:id`                | Merchant | Update product       |
| DELETE | `/products/:id`                | Merchant | Soft delete          |
| PATCH  | `/products/:id/relist`         | Merchant | Re-list expired/sold |
| PATCH  | `/products/:id/media`          | Merchant | Upload media         |
| DELETE | `/products/:id/media/:mediaId` | Merchant | Remove media item    |
| GET    | `/market`                      | Public   | Search & browse      |
| GET    | `/market/:id`                  | Public   | Product detail       |

### Orders — `/orders`

| Method | Endpoint              | Auth     | Description            |
| ------ | --------------------- | -------- | ---------------------- |
| POST   | `/orders`             | Buyer    | Place order            |
| GET    | `/orders/my`          | Buyer    | Own orders             |
| DELETE | `/orders/:id/cancel`  | Buyer    | Cancel pending order   |
| PUT    | `/orders/:id/confirm` | Buyer    | Confirm delivery       |
| GET    | `/orders/incoming`    | Merchant | Incoming orders        |
| PUT    | `/orders/:id/accept`  | Merchant | Accept order           |
| PUT    | `/orders/:id/reject`  | Merchant | Reject order           |
| PUT    | `/orders/:id/status`  | Merchant | Update delivery status |
| GET    | `/orders/:id`         | Both     | Order detail           |

### Auctions — `/auctions`

| Method | Endpoint                                      | Auth     | Description        |
| ------ | --------------------------------------------- | -------- | ------------------ |
| POST   | `/auctions/bids`                              | Buyer    | Place bid          |
| GET    | `/auctions/bids/mine`                         | Buyer    | My active bids     |
| DELETE | `/auctions/bids/:bidId`                       | Buyer    | Withdraw bid       |
| GET    | `/auctions/merchant/products/:productId/bids` | Merchant | Bids on my product |
| POST   | `/auctions/merchant/bids/:bidId/accept`       | Merchant | Accept bid         |

### Wallet — `/wallet`

| Method | Endpoint               | Auth     | Description         |
| ------ | ---------------------- | -------- | ------------------- |
| GET    | `/wallet`              | Merchant | Wallet summary      |
| GET    | `/wallet/transactions` | Merchant | Transaction history |
| POST   | `/wallet/withdraw`     | Merchant | Request withdrawal  |
| GET    | `/wallet/withdrawals`  | Merchant | Withdrawal history  |

### Notifications — `/notifications`

| Method | Endpoint                      | Auth | Description          |
| ------ | ----------------------------- | ---- | -------------------- |
| GET    | `/notifications/stream`       | JWT  | SSE stream           |
| GET    | `/notifications`              | JWT  | Paginated list       |
| GET    | `/notifications/unread`       | JWT  | Unread list (max 50) |
| GET    | `/notifications/unread/count` | JWT  | Badge count          |
| PATCH  | `/notifications/:id/read`     | JWT  | Mark one as read     |
| PATCH  | `/notifications/read-all`     | JWT  | Mark all as read     |

---

## 8. Data Flow

### Order → Payment → Wallet

```
Buyer places order (PENDING)
  └─ Merchant accepts
       ├─ Order → ACCEPTED
       ├─ Stripe Checkout session created
       └─ Payment link sent (email + in-app notification)

Buyer pays (Stripe webhook: checkout.session.completed)
  └─ Payment → PAID
       └─ Order stays ACCEPTED (awaiting delivery)

Buyer confirms delivery
  └─ Order → COMPLETED
       ├─ Platform fee calculated
       ├─ Net amount credited to merchant pendingBalance
       └─ WalletTransaction created (ORDER_EARNING)

Hold period expires (walletHoldDays, default 3)
  └─ pendingBalance → availableBalance
       └─ WalletTransaction created (BALANCE_RELEASE)

Merchant requests withdrawal
  └─ availableBalance decremented (pessimistic lock)
       └─ WithdrawalRequest created (PENDING)
            ├─ Admin approves → COMPLETED + bank transfer
            └─ Admin rejects  → REJECTED + refund to availableBalance
```

### Auction Flow

```
Merchant creates product (saleMethod = AUCTION)
  └─ Product → ACTIVE with auctionEndAt

Buyer places bid
  ├─ Validate bid > currentBid (or auctionStartPrice if no bids)
  ├─ Previous winning bid → isWinning = false
  ├─ New bid → isWinning = true
  └─ product.currentBid updated

Auction end (scheduled job or merchant accept)
  └─ Winning bid found
       └─ Order created automatically
            └─ Normal order flow continues
```

---

## 9. Caching Strategy

All caches use Redis with explicit TTLs and targeted invalidation. No global cache flush is ever used.

| Cache Key Pattern                                | TTL                 | Bust Trigger                     |
| ------------------------------------------------ | ------------------- | -------------------------------- |
| `auth_user:{userId}`                             | 60s                 | logout, logoutAll, role change   |
| `bl:{jti}`                                       | remaining token TTL | on logout                        |
| `users:id:{id}`                                  | 15 min              | profile update, avatar change    |
| `users:public:{id}`                              | 15 min              | profile update                   |
| `users:stats:{id}`                               | 5 min               | new order, rating change         |
| `ratings:one:{id}`                               | 10 min              | rating update, flag removal      |
| `ratings:user:{id}:v{n}:{page}:{limit}`          | 3 min               | version bump on any rating write |
| `ratings:given:{id}:v{n}:{page}:{limit}`         | 3 min               | version bump on any rating write |
| `market:{filterHash}`                            | 2 min               | product create/update/delete     |
| `notifications:count:{userId}`                   | 2 min               | new notification, mark read      |
| `notifications:unread:{userId}`                  | 2 min               | new notification, mark read      |
| `notifications:all:{userId}:v{n}:{page}:{limit}` | 1 min               | version bump on any write        |

**Version-key pattern** is used for all paginated caches. Busting increments a version counter (`ratings:version:user:{id}`) so all page variants are orphaned at once without key scanning. Orphaned keys expire naturally via their TTL.

---

## 10. Job Queues & Schedulers

### Payment Queue (`payment-queue`)

| Job                      | Schedule     | Action                                                   |
| ------------------------ | ------------ | -------------------------------------------------------- |
| `close-expired-payments` | Every 30 min | Cancel orders with unpaid Stripe sessions older than 24h |

### Notifications Queue (`notifications-queue`)

| Job                    | Schedule    | Action                                       |
| ---------------------- | ----------- | -------------------------------------------- |
| `notification-cleanup` | Sunday 3 AM | Delete read notifications older than 30 days |

### Auctions queue (`auctions-queue`) |runs every 1 minute|

All schedulers use `upsertJobScheduler` on `onModuleInit` — existing schedules are cleared first to prevent duplicates across restarts.

---

## 11. Notification System

### Architecture

```
NotificationsService.notify()
  └─ EventEmitter2.emitAsync('notification.created')
       └─ NotificationCreatedListener.handle()
            ├─ NotificationsDispatcher.dispatch()
            │    ├─ Persist Notification row (once)
            │    ├─ IN_APP  → NotificationsGateway.sendNotificationToUser()
            │    ├─ EMAIL   → MailProvider.send()
            │    └─ SMS     → (not yet implemented)
            ├─ bustUnreadForUser() → Redis cache invalidation
            └─ NotificationsSseService.push() → SSE stream
```

### Channels

| Channel  | Transport                 | Status     |
| -------- | ------------------------- | ---------- |
| `IN_APP` | Socket.io WebSocket       | ✅ Active  |
| `IN_APP` | SSE (browser EventSource) | ✅ Active  |
| `EMAIL`  | SMTP via Nodemailer       | ✅ Active  |
| `SMS`    | —                         | 🚧 Planned |

### WebSocket Authentication

Clients connect with `?token=<accessToken>` (or `auth.token`). The gateway verifies the JWT and joins the client to `user:{sub}` room. Unauthenticated connections are immediately disconnected.

### SSE

Each user has a single `Subject<MessageEvent>` shared across tabs. Reference counting ensures the Subject is completed only when the last tab disconnects.

### Email Templates

| Template              | Language | Trigger                    |
| --------------------- | -------- | -------------------------- |
| `WELCOME`             | AR       | User registration          |
| `EMAIL_VERIFICATION`  | AR       | Sign-up OTP                |
| `PASSWORD_RESET`      | AR       | Reset OTP                  |
| `ORDER_CONFIRMATION`  | AR       | Order placed               |
| `PAYMENT_RECEIPT`     | AR       | Payment received           |
| `PAYMENT_LINK`        | AR       | Order accepted by merchant |
| `WITHDRAWAL_APPROVED` | AR       | Withdrawal completed       |

---

## 12. File Uploads & Media

All uploads go through Cloudinary. The `UploadService` handles single and multi-file uploads, replacement (delete old + upload new), and deletion.

| Entity        | Max Files | Field                                      |
| ------------- | --------- | ------------------------------------------ |
| User avatar   | 1         | `profileImage` + `avatarPublicId`          |
| Farm media    | 10        | `FarmMedia[]`                              |
| Product media | 10        | `ProductMedia[]`                           |
| Auction cover | 1         | `auctionImageUrl` + `auctionImagePublicId` |
| Category icon | 1         | `iconUrl` + `iconPublicId`                 |

Files are streamed through memory (never written to disk) using Fastify's multipart parser. The `FileValidationPipe` and `FilesValidationPipe` enforce MIME type and size before Cloudinary upload.

---

## 13. Payment Flow

### Stripe Integration

```
1. Order accepted by merchant
2. PaymentsService.initiatePayment(orderId, buyerId)
   └─ Creates Stripe Checkout Session
        success_url: {FRONTEND_URL}/payment/success?orderId=...
        cancel_url:  {FRONTEND_URL}/payment/cancel?orderId=...
3. Checkout URL sent to buyer via:
   ├─ Email (PAYMENT_LINK template) — best-effort
   └─ In-app notification (primary channel)
4. Buyer completes payment on Stripe-hosted page
5. Stripe fires webhook → POST /payments/webhook
6. PaymentsService.handleWebhook()
   └─ Verifies Stripe signature (raw body — never re-serialized)
        └─ checkout.session.completed
             ├─ Payment → PAID
             └─ Order flow continues
```

### Unpaid Order Cleanup

A BullMQ job runs every 30 minutes. Orders with a `PENDING` payment older than 24 hours are cancelled and the Stripe session is expired.

---

## 14. Security

### Authentication

- Access tokens blacklisted in Redis on logout (`bl:{jti}`)
- `tokenVersion` on User entity invalidates all existing tokens on `logoutAll`
- Refresh tokens stored as SHA-256 hash — plain token never persisted
- JWT type claim (`access` / `refresh`) prevents token type confusion attacks

### Rate Limiting

All auth endpoints are throttled via `@Throttle`:

- Signup, signin, verify-email, refresh, reset: **3 requests / 3 minutes**
- Google OAuth: **5 requests / 3 minutes**

### Guards & Role Enforcement

- `@Public()` decorator explicitly opts out of `JwtAuthGuard`
- `RolesGuard` reads from `@Roles()` metadata — defaults to deny if no role set
- `AdminGuard` requires both `role = ADMIN` and valid `x-admin-secret` header

### Input Validation

- All DTOs use `class-validator` with explicit type transforms
- `ParseUUIDPipe` on all `:id` route parameters
- Paginated endpoints enforce `@Max(100)` on `limit`
- Price fields use `@Min(0.01)` — zero-price orders/bids rejected at DTO level

### Data Privacy

- `ipAddress` on `AuctionBid` — `select: false`, never returned to client
- `buyerPhoneRevealed` on `Order` — `select: false`
- Sensitive User fields (`password`, `refreshTokenHash`, reset fields) — `select: false` + `@Exclude()`
- Stripe webhook raw body verified before processing — `JSON.stringify` fallback removed

### Concurrency

- All wallet mutations use `pessimistic_write` row locks
- `setDefault` on BankAccount uses a transaction to atomically swap the flag
- `rejectWithdrawal` locks the `WithdrawalRequest` row to prevent double-refund

---

## 15. Environment Variables

```env
# App
NODE_ENV=production
PORT=3000
API_PREFIX=api/v1
FRONTEND_URL=https://your-frontend.com
ADMIN_SECRET=your-admin-secret

# Database
DB_HOST=
DB_PORT=5432
DB_USERNAME=
DB_PASSWORD=
DB_NAME=mahaseel

# Redis
REDIS_HOST=
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT
JWT_ACCESS_SECRET=
JWT_ACCESS_EXPIRES=1d
JWT_REFRESH_SECRET=
JWT_REFRESH_EXPIRES=30d

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=https://your-api.com/api/v1/auth/google/callback

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Mail (SMTP)
MAIL_HOST=
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=
MAIL_PASS=
MAIL_FROM_NAME=محصول
MAIL_FROM_ADDRESS=no-reply@mahaseel.com
MAIL_SUPPORT_ADDRESS=support@mahaseel.com

# Business Config
PLATFORM_FEE_PERCENT=5
WALLET_HOLD_DAYS=3
THROTTLE_TTL=60
THROTTLE_LIMIT=100
OTP_EXPIRY_SECONDS=600
OTP_LENGTH=6
OTP_MOCK=false
```
