# 🌾 Marketplace API Documentation

**Base URL:** `{BASE_URL}/api`  
**API Version:** v1.0.0

---

## 📑 Quick Navigation

1. [Type Definitions](#-type-definitions) - Enums, Interfaces, DTOs
2. [Authentication](#-authentication-endpoints)
3. [Users](#-users-endpoints)
4. [Categories](#-categories-endpoints)
5. [Products](#-products-endpoints)
6. [Farms](#-farms-endpoints)
7. [Orders](#-orders-endpoints)
8. [Wallet](#-wallet-endpoints)
9. [Auctions](#-auctions-endpoints)
10. [Ratings](#-ratings-endpoints)
11. [Notifications](#-notifications-endpoints)

---

## 🔑 Type Definitions

### Core Interfaces

```typescript
// Authenticated user from JWT payload
interface AuthUser {
  sub: string; // User ID
  role: Role; // MERCHANT | BUYER | ADMIN
  email: string;
}
```

### Enumerations

#### Role

```typescript
enum Role {
  MERCHANT = 'merchant',
  BUYER = 'buyer',
  ADMIN = 'admin',
}
```

#### Order & Delivery Status

```typescript
enum OrderStatus {
  PENDING = 'PENDING', // Awaiting merchant acceptance
  ACCEPTED = 'ACCEPTED', // Merchant accepted
  REJECTED = 'REJECTED', // Merchant rejected
  COMPLETED = 'COMPLETED', // Buyer confirmed delivery
  CANCELLED = 'CANCELLED', // Buyer cancelled
  REFUNDED = 'REFUNDED', // Payment refunded
}

enum DeliveryStatus {
  PREPARING = 'PREPARING', // Order being prepared
  READY_PICKUP = 'READY_PICKUP', // Ready for pickup
  IN_DELIVERY = 'IN_DELIVERY', // In transit
  DELIVERED = 'DELIVERED', // Delivered to buyer
}
```

#### Product & Auction Status

```typescript
enum ProductStatus {
  DRAFT = 'draft', // Not published
  PENDING_REVIEW = 'pending_review',
  ACTIVE = 'active', // Listed
  SOLD = 'sold',
  EXPIRED = 'expired', // Auction/listing expired
  REJECTED = 'rejected',
  ARCHIVED = 'archived',
}

enum AuctionStatus {
  SCHEDULED = 'scheduled',
  ACTIVE = 'active',
  ENDED = 'ended',
  CANCELLED = 'cancelled',
}

enum BidStatus {
  ACTIVE = 'active',
  WITHDRAWN = 'withdrawn',
  WON = 'won',
  LOST = 'lost',
}
```

#### Sale & Delivery Methods

```typescript
enum SaleMethod {
  FIXED = 'fixed', // Fixed price
  AUCTION = 'auction', // Auction-based
}

enum DeliveryMethod {
  FROM_FARM = 'from_farm', // Buyer picks up
  DRIVER = 'driver', // Merchant delivers
}

enum Unit {
  KG = 'kg',
  TON = 'ton',
  HEAD = 'head', // For livestock
  BOX = 'box',
  PIECE = 'piece',
}
```

#### Farm Status

```typescript
enum FarmStatus {
  PENDING = 'pending', // Awaiting admin approval
  APPROVED = 'approved',
  REJECTED = 'rejected',
}
```

#### Wallet & Withdrawal

```typescript
enum WithdrawalStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  REJECTED = 'rejected',
}

enum WalletTransactionType {
  CREDIT = 'credit',
  DEBIT = 'debit',
  HOLD = 'hold', // Escrow hold
  RELEASE = 'release',
}

enum WalletTransactionReason {
  ORDER_PAYMENT = 'order_payment',
  ORDER_EARNING = 'order_earning',
  ESCROW_HOLD = 'escrow_hold',
  ESCROW_RELEASE = 'escrow_release',
  WITHDRAWAL_REQUESTED = 'withdrawal_requested',
  WITHDRAWAL_COMPLETED = 'withdrawal_completed',
  WITHDRAWAL_REJECTED = 'withdrawal_rejected',
  PLATFORM_FEE = 'platform_fee',
  REFUND = 'refund',
  ADMIN_ADJUSTMENT = 'admin_adjustment',
}
```

#### Notifications

```typescript
enum NotificationType {
  // Orders
  ORDER_PLACED = 'order_placed',
  ORDER_ACCEPTED = 'order_accepted',
  ORDER_REJECTED = 'order_rejected',
  ORDER_STATUS_CHANGED = 'order_status_changed',

  // Auctions
  BID_PLACED = 'bid_placed',
  AUCTION_STARTED = 'auction_started',
  AUCTION_ENDED = 'auction_ended',
  AUCTION_WON = 'auction_won',
  AUCTION_LOST = 'auction_lost',

  // Payments
  PAYMENT_REQUIRED = 'payment_required',
  PAYMENT_RECEIVED = 'payment_received',
  PAYMENT_FAILED = 'payment_failed',
  REFUND_ISSUED = 'refund_issued',

  // Withdrawals
  WITHDRAWAL_REQUESTED = 'withdrawal_requested',
  WITHDRAWAL_COMPLETED = 'withdrawal_completed',
  WITHDRAWAL_REJECTED = 'withdrawal_rejected',

  // Farms
  FARM_APPROVED = 'farm_approved',
  FARM_REJECTED = 'farm_rejected',

  // Reviews
  RATING_RECEIVED = 'rating_received',

  // System
  SYSTEM = 'system',
}

enum NotificationChannel {
  IN_APP = 'in_app',
  PUSH = 'push',
  EMAIL = 'email',
  SMS = 'sms',
}

enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical',
}
```

#### Platform & Media

```typescript
enum Platform {
  IOS = 'ios',
  ANDROID = 'android',
  WEB = 'web',
}

enum MediaType {
  IMAGE = 'image',
  VIDEO = 'video',
}
```

---

## 🔐 Authentication Endpoints

### POST - Sign Up

```http
POST /auth/signup
Content-Type: application/json
```

**Body:**

```typescript
interface SignUpDto {
  fullName: string; // User's full name
  email: string; // Unique email
  password: string; // Min 6 characters
  phone: string; // Mobile phone (E.164 format, e.g. +972591234567)
}
```

**Response:** `201 Created`

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "fullName": "Ahmed Al-Nabulsi",
    "phone": "+972591234567",
    "role": "buyer"
  },
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "expiresIn": 3600
}
```

---

### POST - Sign In

```http
POST /auth/signin
Content-Type: application/json
```

**Body:**

```typescript
interface SignInDto {
  email: string; // User email
  password: string; // Min 6 characters
}
```

**Response:** `200 OK`

```json
{
  "user": {
    /* user object */
  },
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "expiresIn": 3600
}
```

---

### POST - Refresh Token

```http
POST /auth/refresh
Content-Type: application/json
```

**Body:**

```typescript
interface RefreshTokenDto {
  refreshToken: string;
}
```

**Response:** `200 OK`

```json
{
  "accessToken": "eyJhbGc...",
  "expiresIn": 3600
}
```

---

### POST - Logout (Current Device)

```http
POST /auth/logout
Authorization: Bearer {accessToken}
```

**Response:** `200 OK`

```json
{ "message": "Logged out successfully" }
```

---

### POST - Logout All Devices

```http
POST /auth/logout-all
Authorization: Bearer {accessToken}
```

**Response:** `200 OK`

```json
{ "message": "All sessions terminated" }
```

---

### POST - Send Password Reset Code

```http
POST /auth/reset/send-code
Content-Type: application/json
```

**Body:**

```json
{ "email": "user@example.com" }
```

**Response:** `200 OK`

```json
{ "message": "Reset code sent to email" }
```

---

### POST - Verify Reset Code

```http
POST /auth/reset/verify
Content-Type: application/json
```

**Body:**

```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

**Response:** `200 OK`

```json
{ "verificationToken": "temp-token-for-password-change" }
```

---

### POST - Change Password

```http
POST /auth/reset/change-password
Content-Type: application/json
```

**Body:**

```json
{
  "email": "user@example.com",
  "newPassword": "newPassword123"
}
```

**Response:** `200 OK`

```json
{ "message": "Password updated successfully" }
```

---

## 👤 Users Endpoints

### GET - Get Current User Profile

```http
GET /users/me
Authorization: Bearer {accessToken}
```

**Response:** `200 OK`

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "fullName": "Ahmed Al-Nabulsi",
  "phone": "+972591234567",
  "role": "buyer",
  "avatar": "https://...",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

---

### PUT - Update Profile

```http
PUT /users/me
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Body:**

```typescript
interface UpdateProfileDto {
  fullName?: string;
  phone?: string;
  address?: string;
  // ... other optional fields
}
```

**Response:** `200 OK` - Updated user object

---

### POST - Upload Avatar

```http
POST /users/me/avatar
Authorization: Bearer {accessToken}
Content-Type: multipart/form-data
```

**Body:**

- `file`: Image file (JPEG, PNG, WebP)

**Response:** `200 OK`

```json
{
  "avatarUrl": "https://cdn.example.com/avatars/user-123.jpg"
}
```

---

### GET - Get Public User Profile

```http
GET /users/:userId/profile
```

**Response:** `200 OK`

```json
{
  "id": "uuid",
  "fullName": "Ahmed Al-Nabulsi",
  "avatar": "https://...",
  "role": "merchant",
  "averageRating": 4.8,
  "totalRatings": 156
}
```

---

## 🏪 Categories Endpoints

### GET - List All Categories

```http
GET /categories
```

**Response:** `200 OK`

```json
[
  {
    "id": "uuid",
    "name": "Vegetables",
    "description": "Fresh vegetables and greens",
    "icon": "https://...",
    "subCategories": [
      { "id": "uuid", "name": "Leafy Greens" },
      { "id": "uuid", "name": "Root Vegetables" }
    ]
  }
]
```

---

### GET - Get Category Detail

```http
GET /categories/:categoryId
```

**Response:** `200 OK` - Category object with subcategories

---

### POST - Create Category (Admin Only)

```http
POST /categories
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Required Role:** `ADMIN`

**Body:**

```typescript
interface CreateCategoryDto {
  name: string;
  description?: string;
  parentCategoryId?: string; // For subcategories
}
```

**Response:** `201 Created` - Created category object

---

### PUT - Update Category (Admin Only)

```http
PUT /categories/:categoryId
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Required Role:** `ADMIN`

**Body:** Partial CreateCategoryDto

**Response:** `200 OK` - Updated category object

---

### DELETE - Delete Category (Admin Only)

```http
DELETE /categories/:categoryId
Authorization: Bearer {accessToken}
```

**Required Role:** `ADMIN`

**Response:** `204 No Content`

---

## 🛍️ Products Endpoints

### GET - List My Products (Merchant Only)

```http
GET /products?status=ACTIVE
Authorization: Bearer {accessToken}
```

**Required Role:** `MERCHANT`

**Query Parameters:**

- `status` (optional) - Filter: `ACTIVE`, `SOLD`, `EXPIRED`, `DRAFT`

**Response:** `200 OK`

```json
[
  {
    "id": "uuid",
    "name": "Organic Tomatoes",
    "description": "Fresh organic tomatoes",
    "quantity": 100,
    "unit": "kg",
    "saleMethod": "fixed",
    "fixedPrice": 50,
    "categoryId": "uuid",
    "farmId": "uuid",
    "status": "active",
    "images": ["https://..."],
    "createdAt": "2024-01-15T10:30:00Z"
  }
]
```

---

### POST - Create Product (Merchant Only)

```http
POST /products
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Required Role:** `MERCHANT`

**Body:**

```typescript
interface CreateProductDto {
  farmId: string; // Farm UUID
  categoryId?: string; // Category UUID
  name: string; // Product name
  description?: string;
  quantity: number; // Available quantity
  unit: Unit; // kg, ton, head, box, piece
  saleMethod: SaleMethod; // "fixed" | "auction"

  // For fixed price sales
  fixedPrice?: number; // Only if saleMethod === "fixed"

  // For auction sales
  auctionStartPrice?: number; // Only if saleMethod === "auction"
  auctionEndAt?: string; // ISO 8601 date
  auctionDurationHours?: number; // 1-720 hours

  deliveryMethod: DeliveryMethod; // "from_farm" | "driver"
  driverName?: string; // If deliveryMethod === "driver"
  driverPhone?: string; // If deliveryMethod === "driver"
}
```

**Response:** `201 Created` - Created product object

---

### GET - Get Product Detail (Merchant View)

```http
GET /products/:productId
Authorization: Bearer {accessToken}
```

**Required Role:** `MERCHANT`

**Response:** `200 OK` - Product with full details and analytics

---

### PATCH - Update Product (Merchant Only)

```http
PATCH /products/:productId
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Required Role:** `MERCHANT`

**Body:** Partial CreateProductDto

**Response:** `200 OK` - Updated product object

---

### DELETE - Soft Delete Product (Merchant Only)

```http
DELETE /products/:productId
Authorization: Bearer {accessToken}
```

**Required Role:** `MERCHANT`

**Response:** `204 No Content`

---

### PATCH - Re-list Product (Merchant Only)

```http
PATCH /products/:productId/relist
Authorization: Bearer {accessToken}
```

**Required Role:** `MERCHANT`

**Description:** Re-list a sold or expired product with the same details

**Response:** `200 OK` - Re-listed product object

---

### POST - Upload Product Media (Merchant Only)

```http
POST /products/:productId/media
Authorization: Bearer {accessToken}
Content-Type: multipart/form-data
```

**Required Role:** `MERCHANT`

**Body:**

- `files`: Up to 10 image/video files (JPEG, PNG, MP4, WebM)

**Response:** `200 OK`

```json
[
  {
    "id": "uuid",
    "type": "image",
    "url": "https://cdn.example.com/products/...",
    "uploadedAt": "2024-01-15T10:30:00Z"
  }
]
```

---

### DELETE - Delete Product Media (Merchant Only)

```http
DELETE /products/:productId/media/:mediaId
Authorization: Bearer {accessToken}
```

**Required Role:** `MERCHANT`

**Response:** `204 No Content`

---

## 🌾 Farms Endpoints

### GET - List My Farms (Merchant Only)

```http
GET /farms
Authorization: Bearer {accessToken}
```

**Required Role:** `MERCHANT`

**Response:** `200 OK`

```json
[
  {
    "id": "uuid",
    "name": "Green Valley Farm",
    "displayName": "Green Valley",
    "managerName": "Ahmed Al-Nabulsi",
    "contactPhone": "+972591234567",
    "latitude": 32.211,
    "longitude": 35.2007,
    "locationText": "Nablus, Palestine",
    "agRegistryNo": "REG-12345",
    "status": "approved",
    "createdAt": "2024-01-01T00:00:00Z"
  }
]
```

---

### POST - Create Farm (Merchant Only)

```http
POST /farms
Authorization: Bearer {accessToken}
Content-Type: multipart/form-data
```

**Required Role:** `MERCHANT`

**Body:**

```typescript
interface CreateFarmDto {
  name: string; // 2-150 chars
  displayName: string; // 2-150 chars
  managerName: string; // 2-100 chars
  contactPhone: string; // Mobile phone
  latitude?: number;
  longitude?: number;
  locationText?: string;
  agRegistryNo?: string; // Agricultural registry number
}
```

**Files:**

- `registryFile` (optional) - PDF/image of farm registration

**Response:** `201 Created` - Created farm object

---

### GET - Get Farm Detail (Merchant Only)

```http
GET /farms/:farmId
Authorization: Bearer {accessToken}
```

**Required Role:** `MERCHANT`

**Response:** `200 OK` - Farm object with full details

---

### PUT - Update Farm (Merchant Only)

```http
PUT /farms/:farmId
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Required Role:** `MERCHANT`

**Body:** Partial CreateFarmDto

**Response:** `200 OK` - Updated farm object

---

### DELETE - Delete Farm (Merchant Only)

```http
DELETE /farms/:farmId
Authorization: Bearer {accessToken}
```

**Required Role:** `MERCHANT`

**Response:** `204 No Content`

---

### POST - Approve Farm (Admin Only)

```http
POST /farms/:farmId/approve
Authorization: Bearer {accessToken}
```

**Required Role:** `ADMIN`

**Response:** `200 OK` - Approved farm object with status = "approved"

---

## 📦 Orders Endpoints

### POST - Place Order (Buyer Only)

```http
POST /orders
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Required Role:** `BUYER`

**Body:**

```typescript
interface CreateOrderDto {
  productId: string; // Product UUID
  offeredPrice: number; // Buyer's offered price (min 0)
  quantity: number; // Min 0.001
  notes?: string; // Optional delivery notes
}
```

**Response:** `201 Created`

```json
{
  "id": "uuid",
  "buyerId": "uuid",
  "productId": "uuid",
  "merchantId": "uuid",
  "quantity": 5,
  "offeredPrice": 250,
  "status": "PENDING",
  "deliveryStatus": "PREPARING",
  "notes": "Please deliver in the morning",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

---

### GET - List My Orders (Buyer Only)

```http
GET /orders/my?page=1&limit=20
Authorization: Bearer {accessToken}
```

**Required Role:** `BUYER`

**Query Parameters:**

- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)

**Response:** `200 OK` - Paginated orders array

---

### DELETE - Cancel Order (Buyer Only)

```http
DELETE /orders/:orderId/cancel
Authorization: Bearer {accessToken}
```

**Required Role:** `BUYER`

**Response:** `200 OK` - Cancelled order object

---

### GET - List Incoming Orders (Merchant Only)

```http
GET /orders/incoming?page=1&limit=20
Authorization: Bearer {accessToken}
```

**Required Role:** `MERCHANT`

**Query Parameters:**

- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)

**Response:** `200 OK` - Paginated orders array

---

### PUT - Accept Order (Merchant Only)

```http
PUT /orders/:orderId/accept
Authorization: Bearer {accessToken}
```

**Required Role:** `MERCHANT`

**Response:** `200 OK`

```json
{
  "id": "uuid",
  "status": "ACCEPTED",
  "buyerPhone": "+972591234567", // Revealed on acceptance
  "acceptedAt": "2024-01-15T10:35:00Z"
}
```

---

### PUT - Reject Order (Merchant Only)

```http
PUT /orders/:orderId/reject
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Required Role:** `MERCHANT`

**Body:**

```json
{
  "reason": "Out of stock due to unexpected demand"
}
```

**Response:** `200 OK` - Rejected order with reason

---

### PUT - Confirm Delivery (Buyer Only)

```http
PUT /orders/:orderId/confirm
Authorization: Bearer {accessToken}
```

**Required Role:** `BUYER`

**Response:** `200 OK`

```json
{
  "id": "uuid",
  "status": "COMPLETED",
  "deliveryStatus": "DELIVERED",
  "confirmedAt": "2024-01-15T14:00:00Z"
}
```

---

### PUT - Update Delivery Status (Merchant Only)

```http
PUT /orders/:orderId/status
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Required Role:** `MERCHANT`

**Body:**

```typescript
interface UpdateOrderStatusDto {
  status: DeliveryStatus; // PREPARING, READY_PICKUP, IN_DELIVERY, DELIVERED
  reason?: string;
}
```

**Response:** `200 OK` - Updated order object

---

### GET - Get Order Detail

```http
GET /orders/:orderId
Authorization: Bearer {accessToken}
```

**Response:** `200 OK` - Order object (buyer sees their orders, merchant sees incoming orders)

---

## 💰 Wallet Endpoints

### GET - Get Wallet Summary (Merchant Only)

```http
GET /wallet
Authorization: Bearer {accessToken}
```

**Required Role:** `MERCHANT`

**Response:** `200 OK`

```json
{
  "balance": 1500.5,
  "available": 1200.0,
  "onHold": 300.5,
  "totalEarnings": 5000.0,
  "totalWithdrawn": 3500.0,
  "currency": "ILS"
}
```

---

### GET - List Transactions (Merchant Only)

```http
GET /wallet/transactions?page=1&limit=20
Authorization: Bearer {accessToken}
```

**Required Role:** `MERCHANT`

**Query Parameters:**

- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)

**Response:** `200 OK`

```json
[
  {
    "id": "uuid",
    "type": "credit",
    "amount": 250.0,
    "reason": "order_earning",
    "orderId": "uuid",
    "status": "completed",
    "timestamp": "2024-01-15T14:00:00Z"
  }
]
```

---

### POST - Request Withdrawal (Merchant Only)

```http
POST /wallet/withdraw
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Required Role:** `MERCHANT`

**Body:**

```typescript
interface WithdrawDto {
  amount: number; // Min: 1
  bankAccountId?: string; // UUID of saved bank account
  notes?: string;
}
```

**Response:** `201 Created`

```json
{
  "id": "uuid",
  "amount": 500.0,
  "status": "pending",
  "bankAccount": {
    /* account details */
  },
  "requestedAt": "2024-01-15T10:30:00Z"
}
```

---

### GET - List Withdrawals (Merchant Only)

```http
GET /wallet/withdrawals
Authorization: Bearer {accessToken}
```

**Required Role:** `MERCHANT`

**Response:** `200 OK`

```json
[
  {
    "id": "uuid",
    "amount": 500.0,
    "status": "completed",
    "bankAccount": {
      /* account details */
    },
    "requestedAt": "2024-01-15T10:30:00Z",
    "completedAt": "2024-01-16T09:00:00Z"
  }
]
```

---

## 🏷️ Auctions Endpoints

### POST - Place Bid (Buyer Only)

```http
POST /auctions/bids
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Required Role:** `BUYER`

**Body:**

```typescript
interface PlaceBidDto {
  productId: string; // Auction product UUID
  amount: number; // Must exceed current highest bid
}
```

**Response:** `201 Created`

```json
{
  "id": "uuid",
  "productId": "uuid",
  "buyerId": "uuid",
  "amount": 150.0,
  "status": "active",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

---

### GET - List My Active Bids (Buyer Only)

```http
GET /auctions/bids/mine
Authorization: Bearer {accessToken}
```

**Required Role:** `BUYER`

**Response:** `200 OK`

```json
[
  {
    "id": "uuid",
    "productId": "uuid",
    "productName": "Organic Tomatoes",
    "amount": 150.0,
    "status": "active",
    "isHighestBid": true,
    "auctionEndsAt": "2024-01-20T18:00:00Z"
  }
]
```

---

### DELETE - Withdraw Bid (Buyer Only)

```http
DELETE /auctions/bids/:bidId
Authorization: Bearer {accessToken}
```

**Required Role:** `BUYER`

**Response:** `204 No Content`

---

### GET - Get All Bids on Product (Merchant Only)

```http
GET /auctions/merchant/products/:productId/bids
Authorization: Bearer {accessToken}
```

**Required Role:** `MERCHANT`

**Response:** `200 OK` - Array of bids sorted by amount (highest first)

```json
[
  {
    "id": "uuid",
    "buyerId": "uuid",
    "buyerName": "Ahmed",
    "amount": 150.0,
    "status": "active",
    "timestamp": "2024-01-15T10:30:00Z"
  }
]
```

---

### POST - Accept Bid (Merchant Only)

```http
POST /auctions/merchant/bids/:bidId/accept
Authorization: Bearer {accessToken}
```

**Required Role:** `MERCHANT`

**Response:** `200 OK`

```json
{
  "id": "uuid",
  "productId": "uuid",
  "buyerId": "uuid",
  "amount": 150.0,
  "status": "won",
  "acceptedAt": "2024-01-15T11:00:00Z"
}
```

---

## ⭐ Ratings Endpoints

### POST - Submit Rating

```http
POST /ratings
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Required:** ✅ Authenticated

**Body:**

```typescript
interface CreateRatingDto {
  orderId: string; // Completed order UUID
  score: number; // 1-5
  comment?: string; // Max 500 chars
}
```

**Response:** `201 Created`

```json
{
  "id": "uuid",
  "orderId": "uuid",
  "reviewerId": "uuid",
  "recipientId": "uuid",
  "score": 5,
  "comment": "Excellent quality and fast delivery!",
  "createdAt": "2024-01-15T14:00:00Z"
}
```

---

### GET - List My Given Ratings

```http
GET /ratings/given?page=1&limit=20
Authorization: Bearer {accessToken}
```

**Required:** ✅ Authenticated

**Query Parameters:**

- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)

**Response:** `200 OK` - Paginated ratings array

---

### GET - Get User's Received Ratings (Public)

```http
GET /ratings/user/:userId?page=1&limit=20
```

**Response:** `200 OK` - Paginated ratings array

---

### POST - Flag Rating

```http
POST /ratings/:ratingId/flag
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Required:** ✅ Authenticated

**Body:**

```typescript
interface FlagRatingDto {
  reason: FlagReason; // See enum below
  notes?: string; // Max 300 chars
}

enum FlagReason {
  ABUSIVE_CONTENT = 'abusive_content',
  FALSE_INFORMATION = 'false_information',
  SPAM = 'spam',
  INAPPROPRIATE = 'inappropriate',
  OTHER = 'other',
}
```

**Response:** `201 Created` - Flag object

---

### GET - List Pending Flags (Admin Only)

```http
GET /ratings/admin/flags?page=1&limit=20
Authorization: Bearer {accessToken}
```

**Required Role:** `ADMIN`

**Query Parameters:**

- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)

**Response:** `200 OK` - Paginated pending flags

---

### PATCH - Resolve Flag (Admin Only)

```http
PATCH /ratings/admin/flags/:flagId
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Required Role:** `ADMIN`

**Body:**

```typescript
interface ReviewFlagDto {
  status: 'REVIEWED' | 'DISMISSED' | 'REMOVED';
  adminNotes?: string; // Max 500 chars
}
```

**Response:** `200 OK` - Resolved flag object

---

## 🔔 Notifications Endpoints

### GET - List All Notifications

```http
GET /notifications?page=1&limit=20
Authorization: Bearer {accessToken}
```

**Required:** ✅ Authenticated

**Query Parameters:**

- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)

**Response:** `200 OK`

```json
[
  {
    "id": "uuid",
    "userId": "uuid",
    "type": "order_placed",
    "title": "New Order Received",
    "message": "Ahmed ordered 5 kg of tomatoes",
    "orderId": "uuid",
    "isRead": false,
    "createdAt": "2024-01-15T10:30:00Z"
  }
]
```

---

### GET - List Unread Notifications

```http
GET /notifications/unread
Authorization: Bearer {accessToken}
```

**Required:** ✅ Authenticated

**Response:** `200 OK` - Array of unread notifications

---

### GET - Count Unread

```http
GET /notifications/unread/count
Authorization: Bearer {accessToken}
```

**Required:** ✅ Authenticated

**Response:** `200 OK`

```json
{
  "unreadCount": 5
}
```

---

### PATCH - Mark as Read

```http
PATCH /notifications/:notificationId/read
Authorization: Bearer {accessToken}
```

**Required:** ✅ Authenticated

**Response:** `200 OK` - Updated notification object

---

### PATCH - Mark All as Read

```http
PATCH /notifications/read-all
Authorization: Bearer {accessToken}
```

**Required:** ✅ Authenticated

**Response:** `200 OK`

```json
{ "message": "All notifications marked as read" }
```

---

### POST - Register FCM Token (Push Notifications)

```http
POST /notifications/fcm-token
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Required:** ✅ Authenticated

**Body:**

```typescript
interface RegisterFcmDto {
  token: string; // FCM device token
  platform: Platform; // "ios" | "android" | "web"
}
```

**Response:** `200 OK`

```json
{
  "registered": true,
  "platform": "android"
}
```

---

### DELETE - Remove FCM Token

```http
DELETE /notifications/fcm-token
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Required:** ✅ Authenticated

**Body:**

```json
{
  "token": "fcm_device_token"
}
```

**Response:** `204 No Content`

---

## 🌐 Common Patterns

### Pagination

All list endpoints support pagination with these query parameters:

```
?page=1&limit=20
```

**Response Format:**

```json
{
  "data": [
    /* array of items */
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

### Error Responses

All error responses follow this format:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "details": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}
```

### Authentication

All protected endpoints require:

```
Authorization: Bearer {accessToken}
```

---

## 🔑 Legend

| Symbol               | Meaning                             |
| -------------------- | ----------------------------------- |
| **✅ Authenticated** | Requires valid JWT token            |
| **🔑 Role: X**       | Requires specific user role         |
| **Public**           | No authentication required          |
| `201 Created`        | Successful resource creation        |
| `200 OK`             | Successful request                  |
| `204 No Content`     | Successful deletion with no body    |
| `400 Bad Request`    | Validation error                    |
| `401 Unauthorized`   | Invalid/missing token               |
| `403 Forbidden`      | Insufficient permissions            |
| `404 Not Found`      | Resource not found                  |
| `409 Conflict`       | Resource conflict (e.g., duplicate) |
| `500 Server Error`   | Server-side error                   |

---

## 📝 Important Notes

1. **Timestamps** - All timestamps are in ISO 8601 format (UTC)
2. **Currencies** - Prices are in the base currency (ILS by default)
3. **Rate Limiting** - Endpoints are rate-limited to prevent abuse
4. **CORS** - Cross-origin requests are allowed from registered origins
5. **File Uploads** - Max file size is 50MB per file
6. **Phone Numbers** - Must be in E.164 format (e.g., +972591234567)
7. **UUIDs** - All IDs are UUID v4 format
8. **Soft Deletes** - Deleted records remain in the database but are marked as deleted

---

## 🚀 Getting Started

1. **Register** - Call `POST /auth/signup` with your details
2. **Login** - Call `POST /auth/signin` to get tokens
3. **Set Up Farm** - Merchants create farm(s) via `POST /farms`
4. **List Products** - Merchants list products via `POST /products`
5. **Browse & Order** - Buyers browse and place orders
6. **Manage Orders** - Both parties manage order lifecycle
7. **Rate & Review** - Buyers rate completed orders

---
