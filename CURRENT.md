# CURRENT PHASE

Phase 18 in progress: Secure Admin order management and fulfilment workflow is implemented: `pending payment` → Admin confirms payment received → `preparing` → `delivering` → `completed`. Payment confirmation moves orders atomically to `paid` and `preparing`, recording audit events in `audit_events`. State machine enforces strict fulfilment transitions: `preparing` → `delivering` → `completed`, rejecting backward transitions and transitions from completed. Actor identity is derived strictly from verified Clerk admin tokens, rejecting client-supplied IDs or roles. Fulfilment recipient/delivery PII is decrypted only on detail endpoint for verified admin and never exposed in list responses, while completed orders remain immutable historical records. Admin UI at `/admin` includes a dedicated Orders Fulfilment section with real-time status badges, detailed customer/recipient modal, item snapshots, audit trail, and idempotent action buttons with submission loading states. Customer UI at `/checkout/success` updates seamlessly when payment is confirmed, replacing transfer instructions with confirmed payment messaging. Frontend Shop, Product Detail, SearchPage, Homepage (`#best-sellers`), FlowerFinderPage, WishlistPage, Cart, Checkout, and Orders are migrated to the D1-backed catalogue/orders API with intentional gate fallback (`API_NOT_FOUND` → static data) and error/retry states. Static `src/data/products.js` is temporarily retained for unmigrated secondary consumers (ConciergeWidget, FlowerAlreadyTakenPage). API v1 remains default closed (`API_V1_ENABLED=false`).

# LAST VERIFIED TASK

Migrated remaining secondary runtime consumers away from static catalogue data:
- `ConciergeWidget.jsx`:
  - Product recommendation grounding and candidate resolution uses `fetchShopCatalogue` from `catalogueClient.js`.
  - Canonical D1 product data (name, price, media) wins over static data.
  - Inactive/archived products are excluded from purchasable recommendations.
  - API errors/offline states gracefully fall back to local responses without crashing.
  - Removed direct import of `src/data/products.js`.
- `FlowerAlreadyTakenPage.jsx`:
  - Product lookup uses `fetchProductDetail('no-watering-flower')` from `catalogueClient.js`.
  - Preserves `no-watering-flower` special invariants: priceless (`priceVnd: null`), non-purchasable (`isPurchasable: false`), protected, and private gallery behavior (`personalFlowerMedia`).
  - Added loading skeleton and safe error/retry UI.
  - Removed direct import of `src/data/products.js`.
- `src/utils/order.js`:
  - Removed unused static `products` import from `getCartItemPresentation`; uses snapshot/resolved item names, sizes, and wrapping directly.
- `catalogueClient.js`:
  - Retained intentional `404 + API_NOT_FOUND` compatibility fallback to static catalogue while `API_V1_ENABLED=false` remains default.
- Automated tests:
  - Added `test/secondary-catalogue.test.js`: 13/13 passed.
  - `test:frontend`: 382/382 passed.
  - `test:shop`: 12/12 passed.
  - `lint`: 0 warnings, 0 errors.
  - `build`: passed, packaged 5 D1 migration files.
  - `git diff --check`: passed.
  - `API_V1_ENABLED=false` remains default; no deployment occurred.

# CURRENT ARCHITECTURE STATE

React/Vite/Sites serves the SPA through a Cloudflare Worker. Server catalogue/pricing read and mutation authority exists in D1. Server order creation and customer order read authority exists in D1 with AES-GCM encrypted fulfilment PII. Bank-transfer payment presentation with VietQR generation exists on the Worker/D1 with manual/pending confirmation. Admin order fulfilment workflow (`received` / `pending` → Admin confirms payment → `preparing` → `delivering` → `completed`) is implemented with server-authoritative state machine and audit event logging. Media storage authority exists in Cloudflare R2 (`MEDIA_BUCKET`), with D1 storing only media references. All frontend consumers (Shop, Product Detail, SearchPage, Homepage, FlowerFinderPage, WishlistPage, Cart, Checkout, Orders, ConciergeWidget, FlowerAlreadyTakenPage) load/submit through D1 APIs with intentional gate fallback in `catalogueClient.js` (`404 + API_NOT_FOUND`). Admin UI at `/admin` loads both active and archived rows strictly from `GET /api/v1/admin/products`, edits content and commerce fields through `PATCH /api/v1/admin/products/:id`, creates through `POST /api/v1/admin/products`, soft-archives/restores through the explicit action endpoints, uploads/deletes media via `/api/v1/admin/media`, manages sizes/wrapping via `GET/PUT /api/v1/admin/products/:id/variants`, manages gift add-ons via `/api/v1/admin/gift-add-ons`, and manages orders via `/api/v1/admin/orders`. Static `src/data/products.js` is retained solely as the intentional API gate fallback inside `catalogueClient.js`. Clerk React provider wraps the frontend. API v1 remains globally gated closed with `API_V1_ENABLED=false`.

**`products.active` semantics**: `active` conflates BOTH visibility AND purchasability. `active = 0` hides from public catalogue AND makes non-purchasable. Archive/Delete implementation must account for this dual meaning.

**`catalogue_versions` semantics (VERIFIED — seed/package metadata only)**: `catalogue_versions` is a seed-package table, not a live mutation counter. Columns `product_count`, `purchasable_count`, `checksum`, and `seeded_at_utc` describe the seeded batch snapshot as written by the migration generator — there is no `updated_at_utc` column and no runtime bump mechanism. `products.catalogue_version_id` and `product_variants.catalogue_version_id` are FK references that record which seed package a row was seeded from, not mutation counters. The public API exposes only the opaque version string key (`version?.version`); no frontend page reads `product_count`, `purchasable_count`, or `checksum` at runtime. Admin CREATE and UPDATE mutations do NOT bump `catalogue_versions` — this is intentional and architecturally correct. A future batch-reimport or catalogue-repackage migration would insert a new `catalogue_versions` row and update seeded products' FKs.

# WHAT IS WORKING

Storefront routes and mock commerce flows exist. Catalogue invariant is 24 total / 23 purchasable / 1 priceless. Worker-based Groq concierge and local fallback exist. Clerk token verification, stable-sub D1 mapping, duplicate-safe user upsert, unauthenticated protection, frontend Clerk session, Email OTP verification, `/api/v1/me` hydration, sign-out, server-side `requireAdmin` authorization, `/api/v1/admin/me`, `/admin` route protection, D1-backed catalogue listing/detail, Admin product content and commerce editing, Admin product creation with auto-slug generation and R2-backed real image upload, Admin soft archive/restore, Admin product configuration options management (sizes, wrapping, gift add-ons), protected active+archived Admin listing, `no-watering-flower` invariant enforcement, frontend Shop, Product Detail, SearchPage, Homepage, FlowerFinderPage, WishlistPage, Cart, ConciergeWidget, and FlowerAlreadyTakenPage catalogue API integration, server-authoritative Checkout order creation with AES-GCM PII encryption and D1 snapshot persistence, customer Orders history / read model with server-side owner PII decryption and snapshot immutability, real bank-transfer QR payment presentation (manual/pending confirmation), and Admin order fulfilment workflow (`received` / `pending` → Admin confirms payment → `preparing` → `delivering` → `completed`) are verified.

# WHAT IS PARTIAL

Hard delete is not implemented.

# CURRENT BLOCKERS

None. Secondary catalogue consumers are verified locally and `API_V1_ENABLED` remains intentionally disabled by default.

# OPEN RISKS

- Rotation/revocation status of a Groq key previously exposed in chat is UNKNOWN.
- Public deployment may lag behind the repository; parity was not verified in this task.
- `qa/` is untracked.
- README is the generic Vite template.
- `/font-diagnostic` remains exposed.

# NEXT BEST TASK

Perform production-readiness and deployment configuration audit.

# LATEST VERIFIED COMMIT

Use the commit resulting from this Secondary Catalogue Migration checkpoint (`Migrate remaining catalogue consumers`) as the authoritative commit reference.

# DEPLOYMENT STATE

Sites/Worker deployment configuration exists. No deployment is performed by this task; current public parity is UNKNOWN.

# IMPORTANT NOTES

Clerk is the selected managed provider; Auth0 is not used. D1 user role is authoritative for authorization. D1 is authoritative for catalogue, pricing, and orders; frontend static data is temporary compatibility data until Phase 18 migration completes. `products.active` still conflates visibility and purchasability: restoring an archived normal product necessarily makes it visible and purchasable because the current schema has no independent pre-archive purchasability field. Hard delete is not implemented. Payment confirmation remains strictly manual/pending; this task does not mark orders paid automatically, implement bank webhooks, or card payments. Preserve `no-watering-flower`, the original Homepage hero, mock payments, Vietnamese UI, and current visual direction.
