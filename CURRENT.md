# CURRENT PHASE

Phase 18 in progress: Customer Orders history / read model is migrated to authenticated D1-backed orders. Customers access their orders via `GET /api/v1/orders` (list) and `GET /api/v1/orders/:idOrCode` (detail). The list endpoint provides order summaries and item snapshots without decrypting or exposing sensitive fulfilment PII. The detail endpoint decrypts fulfilment PII (`buyer`, `recipient`, `address`, `gifting`) server-side using AES-GCM via `ORDER_FULFILMENT_KEY` strictly for the authenticated order owner (`WHERE user_id = auth.user.id`). Cross-user access returns 404 `ORDER_NOT_FOUND`. Historical order item names, sizes, wrapping, and gift add-ons are reconstructed from immutable snapshots (`options_snapshot_json`, `composition_snapshot_json`, `order_item_add_ons`), isolated from subsequent catalogue mutations. `AccountContext` fetches orders from D1 when authenticated, managing loading, error, and retry states. `AccountPage` displays orders with Vietnamese status labels and direct links to `/checkout/success/:orderCode`. `CheckoutSuccessPage` fetches canonical order details from D1 on direct page reload. Server-authoritative Checkout order creation is implemented via `POST /api/v1/orders`. Admin can edit full non-media, non-option product content, edit core commerce fields, create normal products, archive/restore normal products, and manage product configuration options (sizes & prices, wrapping options, and gift add-ons) from `/admin`. Frontend Shop, Product Detail, SearchPage, Homepage (`#best-sellers`), FlowerFinderPage, WishlistPage, Cart, Checkout, and Orders are migrated to the D1-backed catalogue/orders API with intentional gate fallback (`API_NOT_FOUND` → static data) and error/retry states. Static `src/data/products.js` is temporarily retained for unmigrated secondary consumers (ConciergeWidget, FlowerAlreadyTakenPage). API v1 remains default closed (`API_V1_ENABLED=false`).

# LAST VERIFIED TASK

Migrated Customer Orders History / Read Model to Authenticated D1-Backed Orders:
- Implemented `listForUser(user)` in `src/server/repositories/orderRepository.js`:
  - Enforces authenticated D1 user (`WHERE user_id = user.id ORDER BY datetime(created_at_utc) DESC, id DESC`).
  - Attaches reconstructed item summaries from `order_items` snapshots (`options_snapshot_json`).
  - Does NOT select, decrypt, or expose ciphertext columns or sensitive PII.
- Implemented `getForUser(user, idOrCode)` in `src/server/repositories/orderRepository.js`:
  - Enforces authenticated D1 user (`WHERE user_id = user.id AND (id = ? OR order_code = ?)`).
  - Returns 404 `ORDER_NOT_FOUND` for non-existent orders and cross-user queries (preventing existence oracle).
  - Reconstructs items and add-ons from snapshots (`options_snapshot_json`, `composition_snapshot_json`, `order_item_add_ons`).
  - Decrypts fulfilment PII server-side using AES-GCM via `ORDER_FULFILMENT_KEY` (`buyer`, `recipient`, `address`, `gifting`).
  - Never leaks ciphertext or key to the client.
  - Returns 503 `FULFILMENT_ENCRYPTION_UNAVAILABLE` if key is missing/invalid, 500 `FULFILMENT_DECRYPTION_FAILED` on corrupt data.
- Added API routes in `src/server/api.js`:
  - `GET /api/v1/orders` → `handleListUserOrders`
  - `GET /api/v1/orders/:idOrCode` → `handleGetUserOrder`
  - Gated under `requireAuthenticatedUser`.
- Added client helpers in `src/services/apiClient.js`:
  - `fetchUserOrders({ getToken })`
  - `fetchUserOrderDetail(idOrCode, { getToken })`
- Updated `src/utils/order.js`:
  - `getCartItemPresentation` prioritizes snapshot `name`, `size`, and `wrapping` before static data fallback.
  - Added `formatOrderStatus` (`received` → `Đã tiếp nhận`, etc.) and `formatPaymentStatus` (`mock_pending` → `Chờ thanh toán`, etc.).
- Updated `src/context/AccountContext.jsx`:
  - Loads orders via `fetchUserOrders` on authenticated session mount/change.
  - Manages `isOrdersLoading`, `ordersError`, `refreshOrders`.
  - Clears orders and storage on `logout`.
- Updated `src/pages/AccountPage.jsx`:
  - Displays orders with Vietnamese status labels and handles optional receiver safely.
  - Adds link "Xem chi tiết đơn hoa →" to `/checkout/success/:orderCode`.
  - Provides loading, error with retry, and empty states.
- Updated `src/pages/CheckoutSuccessPage.jsx`:
  - Fetches canonical order detail from D1 on direct reload via `fetchUserOrderDetail`.
  - Provides loading, error/not-found, and decrypted detail states.
- Added comprehensive automated tests in `test/orders-read.test.js` (28/28 pass).
- 61 order tests pass, 295 frontend tests pass, auth tests pass, catalogue tests pass, worker tests pass, d1 validation passes, lint passes with 0 errors and 0 warnings, production build passes.
- Live verification confirmed D1 order listing without PII, owner detail decryption, cross-user 404 rejection, and snapshot immutability.
- `API_V1_ENABLED=false` remains default; no deployment occurred.

# CURRENT ARCHITECTURE STATE

React/Vite/Sites serves the SPA through a Cloudflare Worker. Server catalogue/pricing read and mutation authority exists in D1. Server order creation and customer order read authority exists in D1 with AES-GCM encrypted fulfilment PII. Media storage authority exists in Cloudflare R2 (`MEDIA_BUCKET`), with D1 storing only media references. Frontend Shop, Product Detail, SearchPage, Homepage, FlowerFinderPage, WishlistPage, Cart, Checkout, and Orders load/submit to D1 APIs with transitional fallback. Admin UI at `/admin` loads both active and archived rows strictly from `GET /api/v1/admin/products`, edits content and commerce fields through `PATCH /api/v1/admin/products/:id`, creates through `POST /api/v1/admin/products`, soft-archives/restores through the explicit action endpoints, uploads/deletes media via `/api/v1/admin/media`, manages sizes/wrapping via `GET/PUT /api/v1/admin/products/:id/variants`, and manages gift add-ons via `/api/v1/admin/gift-add-ons`. Static `src/data/products.js` is temporarily retained for unmigrated secondary consumers (ConciergeWidget, FlowerAlreadyTakenPage). Clerk React provider wraps the frontend. API v1 remains globally gated closed with `API_V1_ENABLED=false`.

**`products.active` semantics**: `active` conflates BOTH visibility AND purchasability. `active = 0` hides from public catalogue AND makes non-purchasable. Archive/Delete implementation must account for this dual meaning.

**`catalogue_versions` semantics (VERIFIED — seed/package metadata only)**: `catalogue_versions` is a seed-package table, not a live mutation counter. Columns `product_count`, `purchasable_count`, `checksum`, and `seeded_at_utc` describe the seeded batch snapshot as written by the migration generator — there is no `updated_at_utc` column and no runtime bump mechanism. `products.catalogue_version_id` and `product_variants.catalogue_version_id` are FK references that record which seed package a row was seeded from, not mutation counters. The public API exposes only the opaque version string key (`version?.version`); no frontend page reads `product_count`, `purchasable_count`, or `checksum` at runtime. Admin CREATE and UPDATE mutations do NOT bump `catalogue_versions` — this is intentional and architecturally correct. A future batch-reimport or catalogue-repackage migration would insert a new `catalogue_versions` row and update seeded products' FKs.

# WHAT IS WORKING

Storefront routes and mock commerce flows exist. Catalogue invariant is 24 total / 23 purchasable / 1 priceless. Worker-based Groq concierge and local fallback exist. Clerk token verification, stable-sub D1 mapping, duplicate-safe user upsert, unauthenticated protection, frontend Clerk session, Email OTP verification, `/api/v1/me` hydration, sign-out, server-side `requireAdmin` authorization, `/api/v1/admin/me`, `/admin` route protection, D1-backed catalogue listing/detail, Admin product content and commerce editing, Admin product creation with auto-slug generation and R2-backed real image upload, Admin soft archive/restore, Admin product configuration options management (sizes, wrapping, gift add-ons), protected active+archived Admin listing, `no-watering-flower` invariant enforcement, frontend Shop, Product Detail, SearchPage, Homepage, FlowerFinderPage, WishlistPage, and Cart catalogue API integration, server-authoritative Checkout order creation with AES-GCM PII encryption and D1 snapshot persistence, and customer Orders history / read model with server-side owner PII decryption and snapshot immutability are verified.

# WHAT IS PARTIAL

Secondary catalogue consumers (FlowerAlreadyTakenPage, ConciergeWidget) have not switched to D1 catalogue API yet. Hard delete is not implemented.

# CURRENT BLOCKERS

None. Orders read model migration is verified locally and `API_V1_ENABLED` remains intentionally disabled by default.

# OPEN RISKS

- Rotation/revocation status of a Groq key previously exposed in chat is UNKNOWN.
- Public deployment may lag behind the repository; parity was not verified in this task.
- `qa/` is untracked.
- README is the generic Vite template.
- `/font-diagnostic` remains exposed.

# NEXT BEST TASK

Secondary catalogue consumers migration (ConciergeWidget, FlowerAlreadyTakenPage) or payment integration (QR payment / bank transfer confirmation).

# LATEST VERIFIED COMMIT

Use the commit resulting from this Orders read model migration checkpoint (`Migrate Orders history to D1`) as the authoritative commit reference.

# DEPLOYMENT STATE

Sites/Worker deployment configuration exists. No deployment is performed by this task; current public parity is UNKNOWN.

# IMPORTANT NOTES

Clerk is the selected managed provider; Auth0 is not used. D1 user role is authoritative for authorization. D1 is authoritative for catalogue, pricing, and orders; frontend static data is temporary compatibility data until Phase 18 migration completes. `products.active` still conflates visibility and purchasability: restoring an archived normal product necessarily makes it visible and purchasable because the current schema has no independent pre-archive purchasability field. Hard delete is not implemented. This task does not implement QR payment or bank confirmation workflows. Preserve `no-watering-flower`, the original Homepage hero, mock payments, Vietnamese UI, and current visual direction.
