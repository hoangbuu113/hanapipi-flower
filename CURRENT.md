# CURRENT PHASE

Staging Deployment & Admin Catalogue Media Rendering Fix completed: Seeded product thumbnails in Admin on Staging are normalized via shared `resolveMediaSrc` utility. All 29 authoritative local media files are uploaded into R2 bucket `hanapipi-media-staging`. Automated tests (12 new media unit tests, 151 admin tests, 387 frontend tests) pass cleanly. Staging worker `hanapipi-flower` is built with `CLOUDFLARE_ENV=staging` and deployed to `https://hanapipi-flower.hutstudio.workers.dev`. Live catalogue invariant (24 total / 23 purchasable / 1 priceless) and public media routes (HTTP 200 image/jpeg) verified.

# LAST VERIFIED TASK

Admin catalogue media rendering fix & Staging deployment:
- Uploaded 29 authoritative seeded media files from `src/assets/hanapipi-photos/` to `hanapipi-media-staging` R2 bucket.
- Created `src/utils/media.js` with `resolveMediaSrc` normalizer converting seeded paths to `/api/v1/media/<file>`.
- Updated `src/pages/AdminPage.jsx` to normalize thumbnails using `resolveMediaSrc`.
- Updated `src/services/catalogueClient.js` to reuse `resolveMediaSrc`.
- Added 12 unit tests in `test/media-utils.test.js`.
- Verified build and staging deployment to `https://hanapipi-flower.hutstudio.workers.dev`.
- Verified live catalogue invariant: 24 total / 23 purchasable / 1 priceless (`no-watering-flower`).
- Verified live R2 media endpoints returning HTTP 200 with `image/jpeg` and immutable cache headers.

# CURRENT ARCHITECTURE STATE

React/Vite/Sites serves the SPA through a Cloudflare Worker. Server catalogue/pricing read and mutation authority exists in D1. Server order creation and customer order read authority exists in D1 with AES-GCM encrypted fulfilment PII. Bank-transfer payment presentation with VietQR generation exists on the Worker/D1 with manual/pending confirmation. Admin order fulfilment workflow (`received` / `pending` → Admin confirms payment → `preparing` → `delivering` → `completed`) is implemented with server-authoritative state machine and audit event logging. Media storage authority exists in Cloudflare R2 (`MEDIA_BUCKET`), with D1 storing only media references. All frontend consumers (Shop, Product Detail, SearchPage, Homepage, FlowerFinderPage, WishlistPage, Cart, Checkout, Orders, ConciergeWidget, FlowerAlreadyTakenPage) load/submit through D1 APIs with intentional gate fallback in `catalogueClient.js` (`404 + API_NOT_FOUND`). Admin UI at `/admin` loads both active and archived rows strictly from `GET /api/v1/admin/products`, edits content and commerce fields through `PATCH /api/v1/admin/products/:id`, creates through `POST /api/v1/admin/products`, soft-archives/restores through the explicit action endpoints, uploads/deletes media via `/api/v1/admin/media`, manages sizes/wrapping via `GET/PUT /api/v1/admin/products/:id/variants`, manages gift add-ons via `/api/v1/admin/gift-add-ons`, and manages orders via `/api/v1/admin/orders`. Static `src/data/products.js` is retained solely as the intentional API gate fallback inside `catalogueClient.js`. Clerk React provider wraps the frontend. API v1 remains globally gated closed with `API_V1_ENABLED=false`.

**`products.active` semantics**: `active` conflates BOTH visibility AND purchasability. `active = 0` hides from public catalogue AND makes non-purchasable. Archive/Delete implementation must account for this dual meaning.

**`catalogue_versions` semantics (VERIFIED — seed/package metadata only)**: `catalogue_versions` is a seed-package table, not a live mutation counter. Columns `product_count`, `purchasable_count`, `checksum`, and `seeded_at_utc` describe the seeded batch snapshot as written by the migration generator — there is no `updated_at_utc` column and no runtime bump mechanism. `products.catalogue_version_id` and `product_variants.catalogue_version_id` are FK references that record which seed package a row was seeded from, not mutation counters. The public API exposes only the opaque version string key (`version?.version`); no frontend page reads `product_count`, `purchasable_count`, or `checksum` at runtime. Admin CREATE and UPDATE mutations do NOT bump `catalogue_versions` — this is intentional and architecturally correct. A future batch-reimport or catalogue-repackage migration would insert a new `catalogue_versions` row and update seeded products' FKs.

# WHAT IS WORKING

Storefront routes and mock commerce flows exist. Catalogue invariant is 24 total / 23 purchasable / 1 priceless. Worker-based Groq concierge and local fallback exist. Clerk token verification, stable-sub D1 mapping, duplicate-safe user upsert, unauthenticated protection, frontend Clerk session, Email OTP verification, `/api/v1/me` hydration, sign-out, server-side `requireAdmin` authorization, `/api/v1/admin/me`, `/admin` route protection, D1-backed catalogue listing/detail, Admin product content and commerce editing, Admin product creation with auto-slug generation and R2-backed real image upload, Admin soft archive/restore, Admin product configuration options management (sizes, wrapping, gift add-ons), protected active+archived Admin listing, `no-watering-flower` invariant enforcement, frontend Shop, Product Detail, SearchPage, Homepage, FlowerFinderPage, WishlistPage, Cart, ConciergeWidget, and FlowerAlreadyTakenPage catalogue API integration, server-authoritative Checkout order creation with AES-GCM PII encryption and D1 snapshot persistence, customer Orders history / read model with server-side owner PII decryption and snapshot immutability, real bank-transfer QR payment presentation (manual/pending confirmation), and Admin order fulfilment workflow (`received` / `pending` → Admin confirms payment → `preparing` → `delivering` → `completed`) are verified.

# WHAT IS PARTIAL

Hard delete is not implemented.

# CURRENT BLOCKERS

None.

# OPEN RISKS

- Rotation/revocation status of a Groq key previously exposed in chat is UNKNOWN (must be rotated before public exposure).
- `qa/` is untracked.
- README is the generic Vite template.
- `/font-diagnostic` remains exposed.

# NEXT BEST TASK

Verify Admin UI live on staging with authenticated Clerk Admin session.

# LATEST VERIFIED COMMIT

4c01cbb — Fix Admin catalogue media rendering

# DEPLOYMENT STATE

Deployed to Cloudflare Workers Staging: `https://hanapipi-flower.hutstudio.workers.dev` (Worker: `hanapipi-flower`, D1: `dd0c2d87-889f-4fdf-b15e-b553ee53ccd4`, R2: `hanapipi-media-staging`). Verified live. Production (`hanapipi-flower-prod`) remains untouched.

# IMPORTANT NOTES

Clerk is the selected managed provider; Auth0 is not used. D1 user role is authoritative for authorization. D1 is authoritative for catalogue, pricing, and orders; frontend static data is temporary compatibility data until Phase 18 migration completes. `products.active` still conflates visibility and purchasability: restoring an archived normal product necessarily makes it visible and purchasable because the current schema has no independent pre-archive purchasability field. Hard delete is not implemented. Payment confirmation remains strictly manual/pending; this task does not mark orders paid automatically, implement bank webhooks, or card payments. Preserve `no-watering-flower`, the original Homepage hero, mock payments, Vietnamese UI, and current visual direction.
