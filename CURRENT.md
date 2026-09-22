# CURRENT PHASE

Phase 18 in progress: Server-authoritative Checkout order creation is implemented. Orders are created via `POST /api/v1/orders` requiring an authenticated customer (Clerk token mapped to D1 user). Frontend submits only selection identifiers (`productId`, `sizeId`, `wrappingId`, `giftAddOnIds`, `quantity`) along with recipient, delivery, and buyer details. The Worker re-resolves all products, size variants, wrapping options, and gift add-ons authoritatively from D1, recomputing canonical prices and totals. Fulfilment PII (`buyer_contact_ciphertext`, `recipient_ciphertext`, `delivery_address_ciphertext`, `gift_message_ciphertext`) is encrypted at rest using AES-GCM via `ORDER_FULFILMENT_KEY`; plaintext PII is never stored in D1. An atomic D1 batch insert creates `orders`, `order_items` (with option snapshots and composition snapshots), and `order_item_add_ons`. Cart is cleared only upon confirmed server success, and preserved on failure. Local order history in `localStorage` (`hanapipi-flower:orders`) is preserved for backwards compatibility with `AccountPage` and `CheckoutSuccessPage`. Cart product/variant/option resolution is migrated to the D1-backed catalogue API. Admin can edit full non-media, non-option product content, edit core commerce fields, create normal products, archive/restore normal products, and manage product configuration options (sizes & prices, wrapping options, and gift add-ons) from `/admin`. Product creation/editing UX features automatic Vietnamese-safe URL slug generation and device-based R2 image upload. Product options are server-authoritative and atomic via D1 batch operations. Archive is a soft-delete through the current `products.active` model; hard delete is not implemented. `no-watering-flower` remains strictly protected server-side and client-side as a priceless non-purchasable product with variants protected from mutation. Frontend Shop, Product Detail, SearchPage, Homepage (`#best-sellers`), FlowerFinderPage, WishlistPage, Cart, and Checkout are migrated to the D1-backed catalogue/orders API with intentional gate fallback (`API_NOT_FOUND` → static data) and error/retry states. Static `src/data/products.js` is temporarily retained for unmigrated secondary consumers (ConciergeWidget, FlowerAlreadyTakenPage, order.js, catalogueClient.js). Orders read model migration is still pending. API v1 remains default closed (`API_V1_ENABLED=false`).

# LAST VERIFIED TASK

Implemented Server-Authoritative Checkout Order Creation:
- Added `POST /api/v1/orders` requiring authenticated customer (Clerk token mapped to D1 user via `requireAuthenticatedUser`).
- Created `src/server/fulfilmentCrypto.js` implementing AES-GCM (`aes-gcm-v1`) authenticated encryption/decryption with 12-byte random IVs and 256-bit key from `ORDER_FULFILMENT_KEY`. Returns 503 `FULFILMENT_ENCRYPTION_UNAVAILABLE` if key is missing/invalid.
- Created `src/server/repositories/orderRepository.js`:
  - Validates buyer, recipient, address, delivery, gifting, payment method (`cod_mock`, `bank_transfer_mock`), and items (1-20 items, qty 1-20).
  - Re-resolves product by ID or slug from D1; rejects archived/inactive products and `no-watering-flower` with 409 `PRODUCT_UNAVAILABLE`.
  - Re-resolves size variants; rejects missing/inactive sizes with 409 `SIZE_UNAVAILABLE`.
  - Re-resolves wrapping; rejects missing/inactive wrapping with 409 `WRAPPING_UNAVAILABLE`.
  - Re-resolves gift add-ons; rejects missing/inactive gift add-ons with 409 `GIFT_ADD_ON_UNAVAILABLE`.
  - Computes canonical `unitTotalVnd`, `lineTotalVnd`, and `subtotalVnd`.
  - Encrypts PII fields at rest; inserts atomic D1 batch across `orders` (`status = 'received'`, `payment_status = 'mock_pending'`), `order_items` (with `options_snapshot_json` and `composition_snapshot_json`), and `order_item_add_ons`.
- Created `createOrder` helper in `src/services/apiClient.js` with token handling and authentication failure states.
- Updated `src/pages/CheckoutPage.jsx` to submit selection identifiers, disable submit button while pending (`isSubmitting`), clear cart only on success, preserve cart on error, and display server/field errors.
- Added comprehensive unit and integration tests in `test/order-checkout.test.js` (33/33 pass covering all 36 test requirements).
- 267 frontend tests pass, auth tests pass, worker tests pass, d1 validation passes, lint passes with 0 errors/warnings, production build passes.
- Live verification confirmed order creation, D1 at-rest encryption, PII recovery, snapshot records, and no-watering-flower rejection.
- `API_V1_ENABLED=false` remains default; no deployment occurred.

# CURRENT ARCHITECTURE STATE

React/Vite/Sites serves the SPA through a Cloudflare Worker. Server catalogue/pricing read and mutation authority exists in D1. Server order creation authority exists in D1 with AES-GCM encrypted fulfilment PII. Media storage authority exists in Cloudflare R2 (`MEDIA_BUCKET`), with D1 storing only media references. Frontend Shop, Product Detail, SearchPage, Homepage, FlowerFinderPage, WishlistPage, Cart, and Checkout load/submit to D1 APIs with transitional fallback. Admin UI at `/admin` loads both active and archived rows strictly from `GET /api/v1/admin/products`, edits content and commerce fields through `PATCH /api/v1/admin/products/:id`, creates through `POST /api/v1/admin/products`, soft-archives/restores through the explicit action endpoints, uploads/deletes media via `/api/v1/admin/media`, manages sizes/wrapping via `GET/PUT /api/v1/admin/products/:id/variants`, and manages gift add-ons via `/api/v1/admin/gift-add-ons`. Static `src/data/products.js` is temporarily retained for unmigrated secondary consumers (ConciergeWidget, FlowerAlreadyTakenPage, order.js, catalogueClient.js). Clerk React provider wraps the frontend. API v1 remains globally gated closed with `API_V1_ENABLED=false`. Order history is safely preserved in `localStorage` under `hanapipi-flower:orders`. Orders read model remains on existing unmigrated flow.

**`products.active` semantics**: `active` conflates BOTH visibility AND purchasability. `active = 0` hides from public catalogue AND makes non-purchasable. Archive/Delete implementation must account for this dual meaning.

**`catalogue_versions` semantics (VERIFIED — seed/package metadata only)**: `catalogue_versions` is a seed-package table, not a live mutation counter. Columns `product_count`, `purchasable_count`, `checksum`, and `seeded_at_utc` describe the seeded batch snapshot as written by the migration generator — there is no `updated_at_utc` column and no runtime bump mechanism. `products.catalogue_version_id` and `product_variants.catalogue_version_id` are FK references that record which seed package a row was seeded from, not mutation counters. The public API exposes only the opaque version string key (`version?.version`); no frontend page reads `product_count`, `purchasable_count`, or `checksum` at runtime. Admin CREATE and UPDATE mutations do NOT bump `catalogue_versions` — this is intentional and architecturally correct. A future batch-reimport or catalogue-repackage migration would insert a new `catalogue_versions` row and update seeded products' FKs.

# WHAT IS WORKING

Storefront routes and mock commerce flows exist. Catalogue invariant is 24 total / 23 purchasable / 1 priceless. Worker-based Groq concierge and local fallback exist. Clerk token verification, stable-sub D1 mapping, duplicate-safe user upsert, unauthenticated protection, frontend Clerk session, Email OTP verification, `/api/v1/me` hydration, sign-out, server-side `requireAdmin` authorization, `/api/v1/admin/me`, `/admin` route protection, D1-backed catalogue listing/detail, Admin product content and commerce editing, Admin product creation with auto-slug generation and R2-backed real image upload, Admin soft archive/restore, Admin product configuration options management (sizes, wrapping, gift add-ons), protected active+archived Admin listing, `no-watering-flower` invariant enforcement, frontend Shop, Product Detail, SearchPage, Homepage, FlowerFinderPage, WishlistPage, and Cart catalogue API integration, and server-authoritative Checkout order creation with AES-GCM PII encryption and D1 snapshot persistence are verified.

# WHAT IS PARTIAL

Secondary catalogue consumers (FlowerAlreadyTakenPage, ConciergeWidget) have not switched to D1 catalogue API yet. Hard delete is not implemented. Orders read model has not migrated to Worker/D1; order history is preserved in `localStorage`.

# CURRENT BLOCKERS

None. Checkout server-authoritative order creation is verified locally and `API_V1_ENABLED` remains intentionally disabled by default.

# OPEN RISKS

- Rotation/revocation status of a Groq key previously exposed in chat is UNKNOWN.
- Public deployment may lag behind the repository; parity was not verified in this task.
- `qa/` is untracked.
- README is the generic Vite template.
- `/font-diagnostic` remains exposed.

# NEXT BEST TASK

Orders history server-authoritative read model / migration.

# LATEST VERIFIED COMMIT

Use the commit resulting from this Checkout order creation checkpoint (`Add server-authoritative order creation`) as the authoritative commit reference.

# DEPLOYMENT STATE

Sites/Worker deployment configuration exists. No deployment is performed by this task; current public parity is UNKNOWN.

# IMPORTANT NOTES

Clerk is the selected managed provider; Auth0 is not used. D1 user role is authoritative for authorization. D1 is authoritative for catalogue and pricing; frontend static data is temporary compatibility data until Phase 18 migration completes. `products.active` still conflates visibility and purchasability: restoring an archived normal product necessarily makes it visible and purchasable because the current schema has no independent pre-archive purchasability field. Hard delete is not implemented. This task does not migrate Checkout, Orders, or payments. Preserve `no-watering-flower`, the original Homepage hero, mock payments, Vietnamese UI, and current visual direction.
