# CURRENT PHASE

Phase 18 in progress: Real bank-transfer payment presentation with genuinely scannable VietQR (EMVCo standard) is implemented for newly created orders. Payment confirmation remains strictly manual/pending (`payment_status = 'pending'`, status badge `Chờ thanh toán`). Bank destination details (`BANK_TRANSFER_BANK_NAME`, `BANK_TRANSFER_BANK_CODE`, `BANK_TRANSFER_ACCOUNT_NAME`, `BANK_TRANSFER_ACCOUNT_NUMBER`, `BANK_TRANSFER_BIN`) are configured via Cloudflare Worker server environment variables (`env`), with graceful `PAYMENT_CONFIG_UNAVAILABLE` fallback. VietQR payload is generated deterministically in pure JavaScript (NAPAS GUID `A000000727`, bank BIN, account number, currency `704` VND, canonical order amount, and transfer content `HANAPIPI <orderCode>`) with CRC16-CCITT. The client renders an accessible, scalable SVG QR code via `qrcode-generator` with zero external network requests. Convenient copy buttons with visual feedback ("Đã sao chép") are provided for account number, transfer content, and amount. Customer Orders history and read model are D1-backed, with AES-GCM encrypted fulfilment PII decrypted only on detail endpoint for verified owner. Server-authoritative Checkout order creation is implemented via `POST /api/v1/orders`. Admin can edit full non-media, non-option product content, edit core commerce fields, create normal products, archive/restore normal products, and manage product configuration options from `/admin`. Frontend Shop, Product Detail, SearchPage, Homepage (`#best-sellers`), FlowerFinderPage, WishlistPage, Cart, Checkout, and Orders are migrated to the D1-backed catalogue/orders API with intentional gate fallback (`API_NOT_FOUND` → static data) and error/retry states. Static `src/data/products.js` is temporarily retained for unmigrated secondary consumers (ConciergeWidget, FlowerAlreadyTakenPage). API v1 remains default closed (`API_V1_ENABLED=false`).

# LAST VERIFIED TASK

Added Bank-Transfer QR Payment Presentation (Manual/Pending Confirmation):
- Added migration `drizzle/0004_update_order_payment_constraints.sql` in D1/SQLite:
  - Expands `orders.payment_method` CHECK constraint: `IN ('bank_transfer', 'bank_transfer_mock', 'cod_mock', 'cod')`.
  - Expands `orders.payment_status` CHECK constraint: `IN ('pending', 'paid', 'cancelled', 'mock_pending', 'mock_recorded', 'mock_cancelled')`.
  - Recreates `orders` table and preserves indexes `uq_orders_order_code`, `idx_orders_user_created_at`, `idx_orders_status_created_at`.
  - Registered migration in `schema_versions`.
  - Updated `scripts/d1/validate-foundation.js` assertion to accept updated constraints.
- Implemented `src/server/vietqr.js`:
  - Official NAPAS EMVCo QR code payload generator.
  - Implements `formatTlv(tag, value)` and `crc16Ccitt(payload)` with polynomial 0x1021 and initial value 0xFFFF.
  - Validates bank BIN, account number, non-negative integer amount, and transfer content length.
- Updated `src/server/database.js` & `src/server/repositories/orderRepository.js`:
  - Injected `bankConfig` from Worker `env` (`BANK_TRANSFER_BANK_NAME`, `BANK_TRANSFER_BANK_CODE`, `BANK_TRANSFER_ACCOUNT_NAME`, `BANK_TRANSFER_ACCOUNT_NUMBER`, `BANK_TRANSFER_BIN`).
  - Supports `payment_method = 'bank_transfer'` with `payment_status = 'pending'`.
  - Attaches canonical `payment` presentation object (with bank details, amount, deterministic transfer content `HANAPIPI <orderCode>`, and `qrPayload`) to order create and detail responses.
  - Returns `available: false` with clear Vietnamese message (`PAYMENT_CONFIG_UNAVAILABLE`) when unconfigured.
  - `listForUser` returns payment summary without exposing heavy QR payload or sensitive bank details.
- Updated `src/utils/order.js`:
  - Added `formatPaymentMethod(method)` mapping `'bank_transfer'` to `'Chuyển khoản ngân hàng'`.
  - Ensured `formatPaymentStatus('pending')` returns `'Chờ thanh toán'`.
- Updated `src/pages/CheckoutPage.jsx`:
  - Maps `form.payment === 'bank'` to `paymentMethod: 'bank_transfer'`.
  - Added clear payment method description.
- Updated `src/pages/CheckoutSuccessPage.jsx` & `CheckoutSuccessPage.css`:
  - Renders bank-transfer presentation box with high-contrast, editorial romantic minimalist styling.
  - Renders genuinely scannable VietQR code as responsive, scalable SVG via `qrcode-generator` with zero external dependencies.
  - Displays Bank Name, Account Number, Account Name, Exact Amount (VND), and Transfer Content.
  - Interactive `CopyButton` with 2-second visual feedback ("Đã sao chép") for account number, transfer content, and amount.
  - Reassurance text: "Đơn hoa sẽ được xử lý sau khi Hanapipi Flower xác nhận nhận được chuyển khoản" and "Vui lòng giữ nguyên nội dung chuyển khoản để đơn được xác nhận nhanh nhất".
  - Status badge `Chờ thanh toán`.
- Live end-to-end verification confirmed:
  - Order creation with `payment_method = 'bank_transfer'` returns HTTP 201 with `payment_status = 'pending'`.
  - VietQR payload adheres strictly to NAPAS EMVCo standards (Tag 00, 01, 38 with GUID A000000727, BIN, account, currency 704 VND, amount, transfer content `HANAPIPI <orderCode>`, CRC16).
  - Direct reload of `/checkout/success?orderCode=...` preserves identical payment instructions & QR without creating new orders.
  - Historical isolation: changing catalogue product/variant prices does not affect payment amount or QR payload.
  - Security boundaries: 401 unauthenticated, 404 cross-user, 200 owner, client tamper resistance, 0 QR blobs stored in D1, 0 secret leaks.
  - Graceful degradation when bank config is omitted (`available: false`, `PAYMENT_CONFIG_UNAVAILABLE`, order remains `pending`).
  - Safe cleanup: all test orders removed, 0 test records remain.
- Automated test suites:
  - `test/order-payment.test.js`: 35/35 pass.
  - `test:order`: 96/96 pass.
  - `test:frontend`: 330/330 pass.
  - `test:d1`: passed.
  - `lint`: 0 warnings, 0 errors.
  - `build`: passed, packaged 4 D1 migration files.
  - `git diff --check`: passed.
  - `API_V1_ENABLED=false` remains default; no deployment occurred.

# CURRENT ARCHITECTURE STATE

React/Vite/Sites serves the SPA through a Cloudflare Worker. Server catalogue/pricing read and mutation authority exists in D1. Server order creation and customer order read authority exists in D1 with AES-GCM encrypted fulfilment PII. Bank-transfer payment presentation with VietQR generation exists on the Worker/D1 with manual/pending confirmation. Media storage authority exists in Cloudflare R2 (`MEDIA_BUCKET`), with D1 storing only media references. Frontend Shop, Product Detail, SearchPage, Homepage, FlowerFinderPage, WishlistPage, Cart, Checkout, and Orders load/submit to D1 APIs with transitional fallback. Admin UI at `/admin` loads both active and archived rows strictly from `GET /api/v1/admin/products`, edits content and commerce fields through `PATCH /api/v1/admin/products/:id`, creates through `POST /api/v1/admin/products`, soft-archives/restores through the explicit action endpoints, uploads/deletes media via `/api/v1/admin/media`, manages sizes/wrapping via `GET/PUT /api/v1/admin/products/:id/variants`, and manages gift add-ons via `/api/v1/admin/gift-add-ons`. Static `src/data/products.js` is temporarily retained for unmigrated secondary consumers (ConciergeWidget, FlowerAlreadyTakenPage). Clerk React provider wraps the frontend. API v1 remains globally gated closed with `API_V1_ENABLED=false`.

**`products.active` semantics**: `active` conflates BOTH visibility AND purchasability. `active = 0` hides from public catalogue AND makes non-purchasable. Archive/Delete implementation must account for this dual meaning.

**`catalogue_versions` semantics (VERIFIED — seed/package metadata only)**: `catalogue_versions` is a seed-package table, not a live mutation counter. Columns `product_count`, `purchasable_count`, `checksum`, and `seeded_at_utc` describe the seeded batch snapshot as written by the migration generator — there is no `updated_at_utc` column and no runtime bump mechanism. `products.catalogue_version_id` and `product_variants.catalogue_version_id` are FK references that record which seed package a row was seeded from, not mutation counters. The public API exposes only the opaque version string key (`version?.version`); no frontend page reads `product_count`, `purchasable_count`, or `checksum` at runtime. Admin CREATE and UPDATE mutations do NOT bump `catalogue_versions` — this is intentional and architecturally correct. A future batch-reimport or catalogue-repackage migration would insert a new `catalogue_versions` row and update seeded products' FKs.

# WHAT IS WORKING

Storefront routes and mock commerce flows exist. Catalogue invariant is 24 total / 23 purchasable / 1 priceless. Worker-based Groq concierge and local fallback exist. Clerk token verification, stable-sub D1 mapping, duplicate-safe user upsert, unauthenticated protection, frontend Clerk session, Email OTP verification, `/api/v1/me` hydration, sign-out, server-side `requireAdmin` authorization, `/api/v1/admin/me`, `/admin` route protection, D1-backed catalogue listing/detail, Admin product content and commerce editing, Admin product creation with auto-slug generation and R2-backed real image upload, Admin soft archive/restore, Admin product configuration options management (sizes, wrapping, gift add-ons), protected active+archived Admin listing, `no-watering-flower` invariant enforcement, frontend Shop, Product Detail, SearchPage, Homepage, FlowerFinderPage, WishlistPage, and Cart catalogue API integration, server-authoritative Checkout order creation with AES-GCM PII encryption and D1 snapshot persistence, customer Orders history / read model with server-side owner PII decryption and snapshot immutability, and real bank-transfer QR payment presentation (manual/pending confirmation) are verified.

# WHAT IS PARTIAL

Secondary catalogue consumers (FlowerAlreadyTakenPage, ConciergeWidget) have not switched to D1 catalogue API yet. Hard delete is not implemented. Admin order confirmation workflow is not implemented.

# CURRENT BLOCKERS

None. Bank-transfer QR payment presentation is verified locally and `API_V1_ENABLED` remains intentionally disabled by default.

# OPEN RISKS

- Rotation/revocation status of a Groq key previously exposed in chat is UNKNOWN.
- Public deployment may lag behind the repository; parity was not verified in this task.
- `qa/` is untracked.
- README is the generic Vite template.
- `/font-diagnostic` remains exposed.

# NEXT BEST TASK

Admin payment confirmation workflow or secondary catalogue consumers migration (ConciergeWidget, FlowerAlreadyTakenPage).

# LATEST VERIFIED COMMIT

Use the commit resulting from this Bank-Transfer QR payment checkpoint (`Add bank transfer QR payment flow`) as the authoritative commit reference.

# DEPLOYMENT STATE

Sites/Worker deployment configuration exists. No deployment is performed by this task; current public parity is UNKNOWN.

# IMPORTANT NOTES

Clerk is the selected managed provider; Auth0 is not used. D1 user role is authoritative for authorization. D1 is authoritative for catalogue, pricing, and orders; frontend static data is temporary compatibility data until Phase 18 migration completes. `products.active` still conflates visibility and purchasability: restoring an archived normal product necessarily makes it visible and purchasable because the current schema has no independent pre-archive purchasability field. Hard delete is not implemented. Payment confirmation remains strictly manual/pending; this task does not mark orders paid automatically, implement bank webhooks, or card payments. Preserve `no-watering-flower`, the original Homepage hero, mock payments, Vietnamese UI, and current visual direction.
