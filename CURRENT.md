# CURRENT PHASE

Phase 18 in progress: Admin can edit core commerce fields, create normal products, and archive/restore normal products from `/admin`. Product creation/editing UX is enhanced: Product Name is the primary input with automatic Vietnamese-safe URL slug generation and an expandable path customizer (`Tùy chỉnh đường dẫn`); manual image URL input is replaced with real device-based image upload backed by Cloudflare R2 (`MEDIA_BUCKET`) with instant preview, safe replace, and smooth delete. Archive is a soft-delete through the current `products.active` model; hard delete is not implemented. `no-watering-flower` remains strictly protected server-side and client-side as a priceless non-purchasable product with its private gallery untouched. Frontend Shop, Product Detail, SearchPage, Homepage (`#best-sellers`), and FlowerFinderPage are migrated to the D1-backed catalogue API with intentional gate fallback (`API_NOT_FOUND` → static data) and error/retry states. Static `src/data/products.js` is temporarily retained for unmigrated secondary consumers (CartItems, ConciergeWidget, CommerceContext, FlowerAlreadyTakenPage, WishlistPage, order.js, catalogueClient.js). Non-media product detail editing, variants editing, and commerce migration are still pending. API v1 remains default closed (`API_V1_ENABLED=false`).

# LAST VERIFIED TASK

Implemented Admin Product Media & URL UX enhancements and storage hardening:
- Product Name is the primary Admin input; slug/path auto-generates from Product Name using Vietnamese-safe normalization.
- The technical slug input is hidden from the default visible form; a clean preview (`/san-pham/<slug>`) is displayed, and an advanced path control is expandable via `Tùy chỉnh đường dẫn` with manual override protection and reset-to-name capability.
- Replaced the manual image URL text field with a reusable `ProductImageUploader` component supporting device photo selection (mobile/desktop) and drag-and-drop.
- Real image upload is backed by Cloudflare R2 storage via `MEDIA_BUCKET` binding (`POST /api/v1/admin/media`, `DELETE /api/v1/admin/media/:key`, and public `GET /api/v1/media/:key`).
- Media storage is strictly hardened: normal Worker runtime requires `MEDIA_BUCKET` and fails safely with 503 `MEDIA_STORAGE_UNAVAILABLE` if the binding is absent. Silent volatile in-memory fallback is prohibited in runtime and permitted only as an explicitly injected test fake (`MemoryMediaBucket`).
- Server validates image MIME types (`image/jpeg`, `image/png`, `image/webp`), enforces 10 MB limit, generates safe unique keys (`prod_media_<uuid>.<ext>`), and prevents path traversal.
- D1 `media_json` stores only canonical media references (`/api/v1/media/<key>`); no binary or base64 data is stored in D1.
- Image replace uploads the new image first before deleting the old image. Image removal features smooth animation and preserves previous state if deletion fails.
- `no-watering-flower` romantic/private gallery remains strictly untouched and protected.
- 78/78 admin tests pass; all existing storefront and auth regressions remain green.
- `API_V1_ENABLED=false` was verified; no deployment occurred.

# CURRENT ARCHITECTURE STATE

React/Vite/Sites serves the SPA through a Cloudflare Worker. Server catalogue/pricing read and mutation authority exists in D1. Media storage authority exists in Cloudflare R2 (`MEDIA_BUCKET`), with D1 storing only media references. Frontend Shop, Product Detail, SearchPage, Homepage, and FlowerFinderPage load from D1 catalogue API with transitional 404 fallback. Admin UI at `/admin` loads both active and archived rows strictly from `GET /api/v1/admin/products`, edits through `PATCH /api/v1/admin/products/:id`, creates through `POST /api/v1/admin/products`, soft-archives/restores through the explicit action endpoints, and uploads/deletes media via `/api/v1/admin/media`. Static `src/data/products.js` is temporarily retained for unmigrated secondary consumers (CartItems, ConciergeWidget, CommerceContext, FlowerAlreadyTakenPage, WishlistPage, order.js, catalogueClient.js). Clerk React provider wraps the frontend. API v1 remains globally gated closed with `API_V1_ENABLED=false`. Order history is safely preserved in `localStorage` under `hanapipi-flower:orders`. Commerce (Cart, Wishlist, Checkout) remains on existing unmigrated flows.

**`products.active` semantics**: `active` conflates BOTH visibility AND purchasability. `active = 0` hides from public catalogue AND makes non-purchasable. Archive/Delete implementation must account for this dual meaning.

**`catalogue_versions` semantics (VERIFIED — seed/package metadata only)**: `catalogue_versions` is a seed-package table, not a live mutation counter. Columns `product_count`, `purchasable_count`, `checksum`, and `seeded_at_utc` describe the seeded batch snapshot as written by the migration generator — there is no `updated_at_utc` column and no runtime bump mechanism. `products.catalogue_version_id` and `product_variants.catalogue_version_id` are FK references that record which seed package a row was seeded from, not mutation counters. The public API exposes only the opaque version string key (`version?.version`); no frontend page reads `product_count`, `purchasable_count`, or `checksum` at runtime. Admin CREATE and UPDATE mutations do NOT bump `catalogue_versions` — this is intentional and architecturally correct. A future batch-reimport or catalogue-repackage migration would insert a new `catalogue_versions` row and update seeded products' FKs.

# WHAT IS WORKING

Storefront routes and mock commerce flows exist. Catalogue invariant is 24 total / 23 purchasable / 1 priceless. Worker-based Groq concierge and local fallback exist. Clerk token verification, stable-sub D1 mapping, duplicate-safe user upsert, unauthenticated protection, frontend Clerk session, Email OTP verification, `/api/v1/me` hydration, sign-out, server-side `requireAdmin` authorization, `/api/v1/admin/me`, `/admin` route protection, D1-backed catalogue listing/detail, Admin product commerce editing, Admin product creation with auto-slug generation and R2-backed real image upload, Admin soft archive/restore, protected active+archived Admin listing, `no-watering-flower` invariant enforcement, and frontend Shop, Product Detail, SearchPage, Homepage, and FlowerFinderPage catalogue API integration are verified.

# WHAT IS PARTIAL

Secondary catalogue consumers (FlowerAlreadyTakenPage, ConciergeWidget, WishlistPage, CartItems, CommerceContext) have not switched to D1 catalogue API yet. Hard delete, non-media full detail editing, and variants editing are not implemented. Cart, Wishlist, Checkout, and Orders have not migrated to Worker/D1; static and D1 catalogues temporarily coexist.

# CURRENT BLOCKERS

None. Admin archive/restore is verified locally and `API_V1_ENABLED` remains intentionally disabled by default.

# OPEN RISKS

- Rotation/revocation status of a Groq key previously exposed in chat is UNKNOWN.
- Public deployment may lag behind the repository; parity was not verified in this task.
- `qa/` is untracked.
- README is the generic Vite template.
- `/font-diagnostic` remains exposed.

# NEXT BEST TASK

Full product detail editing only.

# LATEST VERIFIED COMMIT

Use the commit resulting from this Admin archive/restore checkpoint (`Add admin product archive restore`) as the authoritative commit reference.

# DEPLOYMENT STATE

Sites/Worker deployment configuration exists. No deployment is performed by this task; current public parity is UNKNOWN.

# IMPORTANT NOTES

Clerk is the selected managed provider; Auth0 is not used. D1 user role is authoritative for authorization. D1 is authoritative for catalogue and pricing; frontend static data is temporary compatibility data until Phase 18 migration completes. `products.active` still conflates visibility and purchasability: restoring an archived normal product necessarily makes it visible and purchasable because the current schema has no independent pre-archive purchasability field. Hard delete is not implemented. This task does not migrate Cart, Wishlist, Checkout, Orders, or payments. Preserve `no-watering-flower`, the original Homepage hero, mock payments, Vietnamese UI, and current visual direction.
