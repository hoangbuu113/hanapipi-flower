# CURRENT PHASE

Phase 18 in progress: Secure Admin order management and fulfilment workflow is implemented: `pending payment` → Admin confirms payment received → `preparing` → `delivering` → `completed`. Payment confirmation moves orders atomically to `paid` and `preparing`, recording audit events in `audit_events`. State machine enforces strict fulfilment transitions: `preparing` → `delivering` → `completed`, rejecting backward transitions and transitions from completed. Actor identity is derived strictly from verified Clerk admin tokens, rejecting client-supplied IDs or roles. Fulfilment recipient/delivery PII is decrypted only on detail endpoint for verified admin and never exposed in list responses, while completed orders remain immutable historical records. Admin UI at `/admin` includes a dedicated Orders Fulfilment section with real-time status badges, detailed customer/recipient modal, item snapshots, audit trail, and idempotent action buttons with submission loading states. Customer UI at `/checkout/success` updates seamlessly when payment is confirmed, replacing transfer instructions with confirmed payment messaging. Frontend Shop, Product Detail, SearchPage, Homepage (`#best-sellers`), FlowerFinderPage, WishlistPage, Cart, Checkout, and Orders are migrated to the D1-backed catalogue/orders API with intentional gate fallback (`API_NOT_FOUND` → static data) and error/retry states. Static `src/data/products.js` is temporarily retained for unmigrated secondary consumers (ConciergeWidget, FlowerAlreadyTakenPage). API v1 remains default closed (`API_V1_ENABLED=false`).

# LAST VERIFIED TASK

Added Admin Order Fulfilment Workflow:
- Added migration `drizzle/0005_add_order_delivering_status.sql` in D1/SQLite:
  - Expands `orders.status` CHECK constraint: `IN ('received', 'confirmed', 'preparing', 'delivering', 'out_for_delivery', 'completed', 'cancelled')`.
  - Recreates child tables `order_items` and `order_item_add_ons` within transaction to prevent foreign key errors.
  - Registered migration in `schema_versions`.
- Implemented `src/server/repositories/orderRepository.js`:
  - `listForAdmin(adminUser)`: Verifies admin role, queries all orders newest first, attaches snapshot item counts and summaries, never exposes decrypted PII or ciphertext.
  - `getForAdmin(adminUser, idOrCode, options)`: Decrypts fulfilment PII (`buyer`, `recipient`, `address`, `gifting`), reconstructs snapshot items/add-ons, attaches payment presentation DTO, and queries `audit_events` for order history (`auditHistory`).
  - `confirmPayment(adminUser, idOrCode, options)`: Verifies `payment_status === 'pending'`, conditionally updates `payment_status = 'paid'` and (if `status === 'received'`) `status = 'preparing'`, records `audit_events` (`action: 'order_payment_confirmed'`, `status_before: 'received'`, `status_after: 'preparing'`), returns updated order. Idempotent if already `paid`.
  - `updateStatus(adminUser, idOrCode, requestedStatus, options)`: Enforces strict state machine transitions (`received` → `preparing` (requires `paid`), `preparing` → `delivering`, `delivering` → `completed`). Rejects invalid backwards/skipped jumps. Conditionally updates `orders.status` and writes `audit_events` (`action: 'order_status_updated'`).
- Implemented `src/server/api.js`:
  - Routes: `GET /api/v1/admin/orders`, `GET /api/v1/admin/orders/:id`, `POST /api/v1/admin/orders/:id/confirm-payment`, `POST /api/v1/admin/orders/:id/status`.
  - Route matchers, 405 Method Not Allowed, origin validation on mutations, and 401/403 guards.
- Implemented `src/services/adminClient.js`:
  - `fetchAdminOrders`, `fetchAdminOrderDetail`, `confirmAdminOrderPayment`, `updateAdminOrderStatus`.
- Updated `src/utils/order.js`:
  - Formatter mappings: `received` → `'Đã tiếp nhận'`, `preparing`/`processing` → `'Đang chuẩn bị'`, `delivering`/`out_for_delivery` → `'Đang giao'`, `completed` → `'Hoàn tất'`.
  - Payment status mappings: `pending`/`mock_pending` → `'Chờ thanh toán'`, `paid` → `'Đã thanh toán'`.
- Updated `src/pages/CheckoutSuccessPage.jsx` & `CheckoutSuccessPage.css`:
  - Replaces pending QR block with `bank-transfer-box--paid` displaying `❀ Hanapipi đã xác nhận thanh toán` when `payment_status === 'paid'`.
- Implemented `src/pages/AdminPage.jsx` & `AdminPage.css`:
  - Orders Fulfilment section with order code, timestamp, recipient, delivery date/slot, total VND, payment badge, status badge, and detail action.
  - Order Detail Modal: customer/recipient contact, decrypted address & gifting message, ordered items with snapshots, payment details, audit trail history, and context-sensitive action buttons (`Xác nhận đã nhận thanh toán`, `Bắt đầu giao hàng`, `Đánh dấu hoàn tất`) with loading states.
- Automated test suites:
  - `test/admin-orders.test.js`: 38/38 pass.
  - `test:admin`: 151/151 pass.
  - `test:order`: 134/134 pass.
  - `test:frontend`: 368/368 pass.
  - `test:d1`: passed (5 migrations validated).
  - `lint`: 0 warnings, 0 errors.
  - `build`: passed, packaged 5 D1 migration files.
  - `git diff --check`: passed.
  - `API_V1_ENABLED=false` remains default; no deployment occurred.

# CURRENT ARCHITECTURE STATE

React/Vite/Sites serves the SPA through a Cloudflare Worker. Server catalogue/pricing read and mutation authority exists in D1. Server order creation and customer order read authority exists in D1 with AES-GCM encrypted fulfilment PII. Bank-transfer payment presentation with VietQR generation exists on the Worker/D1 with manual/pending confirmation. Admin order fulfilment workflow (`received` / `pending` → Admin confirms payment → `preparing` → `delivering` → `completed`) is implemented with server-authoritative state machine and audit event logging. Media storage authority exists in Cloudflare R2 (`MEDIA_BUCKET`), with D1 storing only media references. Frontend Shop, Product Detail, SearchPage, Homepage, FlowerFinderPage, WishlistPage, Cart, Checkout, and Orders load/submit to D1 APIs with transitional fallback. Admin UI at `/admin` loads both active and archived rows strictly from `GET /api/v1/admin/products`, edits content and commerce fields through `PATCH /api/v1/admin/products/:id`, creates through `POST /api/v1/admin/products`, soft-archives/restores through the explicit action endpoints, uploads/deletes media via `/api/v1/admin/media`, manages sizes/wrapping via `GET/PUT /api/v1/admin/products/:id/variants`, manages gift add-ons via `/api/v1/admin/gift-add-ons`, and manages orders via `/api/v1/admin/orders`. Static `src/data/products.js` is temporarily retained for unmigrated secondary consumers (ConciergeWidget, FlowerAlreadyTakenPage). Clerk React provider wraps the frontend. API v1 remains globally gated closed with `API_V1_ENABLED=false`.

**`products.active` semantics**: `active` conflates BOTH visibility AND purchasability. `active = 0` hides from public catalogue AND makes non-purchasable. Archive/Delete implementation must account for this dual meaning.

**`catalogue_versions` semantics (VERIFIED — seed/package metadata only)**: `catalogue_versions` is a seed-package table, not a live mutation counter. Columns `product_count`, `purchasable_count`, `checksum`, and `seeded_at_utc` describe the seeded batch snapshot as written by the migration generator — there is no `updated_at_utc` column and no runtime bump mechanism. `products.catalogue_version_id` and `product_variants.catalogue_version_id` are FK references that record which seed package a row was seeded from, not mutation counters. The public API exposes only the opaque version string key (`version?.version`); no frontend page reads `product_count`, `purchasable_count`, or `checksum` at runtime. Admin CREATE and UPDATE mutations do NOT bump `catalogue_versions` — this is intentional and architecturally correct. A future batch-reimport or catalogue-repackage migration would insert a new `catalogue_versions` row and update seeded products' FKs.

# WHAT IS WORKING

Storefront routes and mock commerce flows exist. Catalogue invariant is 24 total / 23 purchasable / 1 priceless. Worker-based Groq concierge and local fallback exist. Clerk token verification, stable-sub D1 mapping, duplicate-safe user upsert, unauthenticated protection, frontend Clerk session, Email OTP verification, `/api/v1/me` hydration, sign-out, server-side `requireAdmin` authorization, `/api/v1/admin/me`, `/admin` route protection, D1-backed catalogue listing/detail, Admin product content and commerce editing, Admin product creation with auto-slug generation and R2-backed real image upload, Admin soft archive/restore, Admin product configuration options management (sizes, wrapping, gift add-ons), protected active+archived Admin listing, `no-watering-flower` invariant enforcement, frontend Shop, Product Detail, SearchPage, Homepage, FlowerFinderPage, WishlistPage, and Cart catalogue API integration, server-authoritative Checkout order creation with AES-GCM PII encryption and D1 snapshot persistence, customer Orders history / read model with server-side owner PII decryption and snapshot immutability, real bank-transfer QR payment presentation (manual/pending confirmation), and Admin order fulfilment workflow (`received` / `pending` → Admin confirms payment → `preparing` → `delivering` → `completed`) are verified.

# WHAT IS PARTIAL

Secondary catalogue consumers (FlowerAlreadyTakenPage, ConciergeWidget) have not switched to D1 catalogue API yet. Hard delete is not implemented.

# CURRENT BLOCKERS

None. Admin order fulfilment workflow is verified locally and `API_V1_ENABLED` remains intentionally disabled by default.

# OPEN RISKS

- Rotation/revocation status of a Groq key previously exposed in chat is UNKNOWN.
- Public deployment may lag behind the repository; parity was not verified in this task.
- `qa/` is untracked.
- README is the generic Vite template.
- `/font-diagnostic` remains exposed.

# NEXT BEST TASK

Secondary catalogue consumers migration (ConciergeWidget, FlowerAlreadyTakenPage).

# LATEST VERIFIED COMMIT

Use the commit resulting from this Admin Order Fulfilment workflow checkpoint (`Add Admin order fulfilment workflow`) as the authoritative commit reference.

# DEPLOYMENT STATE

Sites/Worker deployment configuration exists. No deployment is performed by this task; current public parity is UNKNOWN.

# IMPORTANT NOTES

Clerk is the selected managed provider; Auth0 is not used. D1 user role is authoritative for authorization. D1 is authoritative for catalogue, pricing, and orders; frontend static data is temporary compatibility data until Phase 18 migration completes. `products.active` still conflates visibility and purchasability: restoring an archived normal product necessarily makes it visible and purchasable because the current schema has no independent pre-archive purchasability field. Hard delete is not implemented. Payment confirmation remains strictly manual/pending; this task does not mark orders paid automatically, implement bank webhooks, or card payments. Preserve `no-watering-flower`, the original Homepage hero, mock payments, Vietnamese UI, and current visual direction.
