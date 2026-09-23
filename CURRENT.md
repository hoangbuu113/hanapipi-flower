# CURRENT PHASE

Production-Readiness Audit completed: Full-stack application audited and hardened for staging deployment. Core commerce flows (D1 Catalogue -> Cart -> Server-Authoritative Checkout -> VietQR Bank Transfer Presentation -> Admin Order Fulfilment) are verified end-to-end. Server secrets (`ORDER_FULFILMENT_KEY`, `CLERK_JWT_KEY`, `GROQ_API_KEY`) and Cloudflare bindings (`DB`, `MEDIA_BUCKET`, `ASSETS`) are audited. Added `ORDER_FULFILMENT_KEY` to `secrets.required` in `wrangler.jsonc`. Production build passes, client bundle secret scan confirms zero server secrets or PII exposed, and postbuild cleanly removes `.dev.vars` while packaging all 5 D1 migrations. All 573 automated tests pass with 0 lint errors. `API_V1_ENABLED=false` remains default closed in committed configuration.

# LAST VERIFIED TASK

Production-readiness audit and configuration hardening:
- Audited secret/env inventory across client and server.
- Audited D1 migrations (`0001_phase16_foundation.sql` through `0005_add_order_delivering_status.sql`).
- Audited Cloudflare R2 media storage (`MEDIA_BUCKET`) security and error handling.
- Audited Clerk JWT verification, subject mapping, and authorization (`requireAuthenticatedUser`, `requireAdmin`).
- Audited bank-transfer payment presentation with VietQR (NAPAS 247 EMVCo standard).
- Audited AES-GCM PII encryption for buyer contact, recipient, address, and gift message in D1.
- Audited Groq concierge proxy, prompt injection protections, and PII redaction.
- Audited CORS, origin mutation validation, and baseline HTTP security headers.
- Audited structured JSON logging (6 allowlisted safe fields, zero server `console.log`).
- Audited static catalogue fallback in `catalogueClient.js` (isolated to 404 / `API_NOT_FOUND`).
- Hardening fix: Added `ORDER_FULFILMENT_KEY` to `secrets.required` in `wrangler.jsonc`.
- Production build verified: `vite build` + `remove-build-dev-vars.js`.
- Secret scan on `dist/client/`: 0 secrets, 0 server symbols, 0 PII.
- Automated tests:
  - `test:secondary`: 13/13 passed.
  - `test:order` + `test:admin`: 151/151 passed.
  - `test:frontend`: 382/382 passed.
  - `test:auth`: 15/15 passed.
  - `test:catalogue`: 14/14 passed.
  - `test:worker`: 11/11 passed.
  - `test:d1`: foundation validation passed.
  - `lint`: 0 warnings, 0 errors.
  - `git diff --check`: passed.
- `API_V1_ENABLED=false` remains default closed; no deployment occurred.

# CURRENT ARCHITECTURE STATE

React/Vite/Sites serves the SPA through a Cloudflare Worker. Server catalogue/pricing read and mutation authority exists in D1. Server order creation and customer order read authority exists in D1 with AES-GCM encrypted fulfilment PII. Bank-transfer payment presentation with VietQR generation exists on the Worker/D1 with manual/pending confirmation. Admin order fulfilment workflow (`received` / `pending` → Admin confirms payment → `preparing` → `delivering` → `completed`) is implemented with server-authoritative state machine and audit event logging. Media storage authority exists in Cloudflare R2 (`MEDIA_BUCKET`), with D1 storing only media references. All frontend consumers (Shop, Product Detail, SearchPage, Homepage, FlowerFinderPage, WishlistPage, Cart, Checkout, Orders, ConciergeWidget, FlowerAlreadyTakenPage) load/submit through D1 APIs with intentional gate fallback in `catalogueClient.js` (`404 + API_NOT_FOUND`). Admin UI at `/admin` loads both active and archived rows strictly from `GET /api/v1/admin/products`, edits content and commerce fields through `PATCH /api/v1/admin/products/:id`, creates through `POST /api/v1/admin/products`, soft-archives/restores through the explicit action endpoints, uploads/deletes media via `/api/v1/admin/media`, manages sizes/wrapping via `GET/PUT /api/v1/admin/products/:id/variants`, manages gift add-ons via `/api/v1/admin/gift-add-ons`, and manages orders via `/api/v1/admin/orders`. Static `src/data/products.js` is retained solely as the intentional API gate fallback inside `catalogueClient.js`. Clerk React provider wraps the frontend. API v1 remains globally gated closed with `API_V1_ENABLED=false`.

**`products.active` semantics**: `active` conflates BOTH visibility AND purchasability. `active = 0` hides from public catalogue AND makes non-purchasable. Archive/Delete implementation must account for this dual meaning.

**`catalogue_versions` semantics (VERIFIED — seed/package metadata only)**: `catalogue_versions` is a seed-package table, not a live mutation counter. Columns `product_count`, `purchasable_count`, `checksum`, and `seeded_at_utc` describe the seeded batch snapshot as written by the migration generator — there is no `updated_at_utc` column and no runtime bump mechanism. `products.catalogue_version_id` and `product_variants.catalogue_version_id` are FK references that record which seed package a row was seeded from, not mutation counters. The public API exposes only the opaque version string key (`version?.version`); no frontend page reads `product_count`, `purchasable_count`, or `checksum` at runtime. Admin CREATE and UPDATE mutations do NOT bump `catalogue_versions` — this is intentional and architecturally correct. A future batch-reimport or catalogue-repackage migration would insert a new `catalogue_versions` row and update seeded products' FKs.

# WHAT IS WORKING

Storefront routes and mock commerce flows exist. Catalogue invariant is 24 total / 23 purchasable / 1 priceless. Worker-based Groq concierge and local fallback exist. Clerk token verification, stable-sub D1 mapping, duplicate-safe user upsert, unauthenticated protection, frontend Clerk session, Email OTP verification, `/api/v1/me` hydration, sign-out, server-side `requireAdmin` authorization, `/api/v1/admin/me`, `/admin` route protection, D1-backed catalogue listing/detail, Admin product content and commerce editing, Admin product creation with auto-slug generation and R2-backed real image upload, Admin soft archive/restore, Admin product configuration options management (sizes, wrapping, gift add-ons), protected active+archived Admin listing, `no-watering-flower` invariant enforcement, frontend Shop, Product Detail, SearchPage, Homepage, FlowerFinderPage, WishlistPage, Cart, ConciergeWidget, and FlowerAlreadyTakenPage catalogue API integration, server-authoritative Checkout order creation with AES-GCM PII encryption and D1 snapshot persistence, customer Orders history / read model with server-side owner PII decryption and snapshot immutability, real bank-transfer QR payment presentation (manual/pending confirmation), and Admin order fulfilment workflow (`received` / `pending` → Admin confirms payment → `preparing` → `delivering` → `completed`) are verified.

# WHAT IS PARTIAL

Hard delete is not implemented.

# CURRENT BLOCKERS

None for local codebase. Before staging deployment, Cloudflare resources must be provisioned (D1 remote DB, R2 bucket, and secrets `CLERK_JWT_KEY`, `GROQ_API_KEY`, `ORDER_FULFILMENT_KEY`).

# OPEN RISKS

- Rotation/revocation status of a Groq key previously exposed in chat is UNKNOWN (must be rotated before public exposure).
- Public deployment may lag behind the repository; parity was not verified in this task.
- `qa/` is untracked.
- README is the generic Vite template.
- `/font-diagnostic` remains exposed.

# NEXT BEST TASK

Provision staging Cloudflare resources and deploy to staging.

# LATEST VERIFIED COMMIT

Use the commit resulting from this Secondary Catalogue Migration checkpoint (`Migrate remaining catalogue consumers`) as the authoritative commit reference.

# DEPLOYMENT STATE

Sites/Worker deployment configuration exists. No deployment is performed by this task; current public parity is UNKNOWN.

# IMPORTANT NOTES

Clerk is the selected managed provider; Auth0 is not used. D1 user role is authoritative for authorization. D1 is authoritative for catalogue, pricing, and orders; frontend static data is temporary compatibility data until Phase 18 migration completes. `products.active` still conflates visibility and purchasability: restoring an archived normal product necessarily makes it visible and purchasable because the current schema has no independent pre-archive purchasability field. Hard delete is not implemented. Payment confirmation remains strictly manual/pending; this task does not mark orders paid automatically, implement bank webhooks, or card payments. Preserve `no-watering-flower`, the original Homepage hero, mock payments, Vietnamese UI, and current visual direction.
