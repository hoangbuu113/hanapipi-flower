# CURRENT PHASE

Phase 18 in progress: Wishlist product resolution is migrated to the D1-backed catalogue API (`fetchShopCatalogue`). Local wishlist identifiers (`["nang-diu", ...]`) resolve canonical product data (`name`, `priceVnd`, `media`, `status`, `purchasability`, `slug`) dynamically. Wishlist persistence remains in `localStorage` under `hanapipi-flower:wishlist` with backward-compatible normalization for legacy object snapshots. Admin can edit full non-media, non-option product content, edit core commerce fields, create normal products, archive/restore normal products, and manage product configuration options (sizes & prices, wrapping options, and gift add-ons) from `/admin`. Product creation/editing UX features automatic Vietnamese-safe URL slug generation and device-based R2 image upload. Product options are server-authoritative and atomic via D1 batch operations. Archive is a soft-delete through the current `products.active` model; hard delete is not implemented. `no-watering-flower` remains strictly protected server-side and client-side as a priceless non-purchasable product with variants protected from mutation. Frontend Shop, Product Detail, SearchPage, Homepage (`#best-sellers`), FlowerFinderPage, and WishlistPage are migrated to the D1-backed catalogue API with intentional gate fallback (`API_NOT_FOUND` → static data) and error/retry states. Static `src/data/products.js` is temporarily retained for unmigrated secondary consumers (CartItems, ConciergeWidget, CommerceContext for Cart only, FlowerAlreadyTakenPage, order.js, catalogueClient.js). Non-media full product detail editing is complete; commerce migration (Cart, Checkout, Orders) is still pending. API v1 remains default closed (`API_V1_ENABLED=false`).

# LAST VERIFIED TASK

Migrated Wishlist to D1 Catalogue API:
- Wishlist product resolution severed from static `src/data/products.js`; `WishlistPage.jsx` now loads canonical product data via `fetchShopCatalogue` from `src/services/catalogueClient.js`.
- Persistence remains local in `localStorage` (`hanapipi-flower:wishlist`) as an array of string identifiers (`["nang-diu", ...]`).
- Created `src/utils/wishlist.js` with `normalizeStoredWishlistIds` to safely read and normalize legacy stored formats (objects with `id`/`slug` or strings), deduplicate entries, and filter invalid items.
- Server-authoritative: name, price (`priceVnd`), media, purchasability, and status reflect live D1 database state. Admin price or detail changes propagate automatically to Wishlist upon page reload or refetch.
- Archived (`active = 0`) or missing products are safely omitted from the Wishlist view without resurrecting them from static data, while retaining their IDs in `localStorage` for automatic reappearance if restored.
- `no-watering-flower` invariant preserved: displays as priceless (`Giá: Vô giá`), non-purchasable, and navigates correctly to its special story detail page.
- Comprehensive test coverage: 20 unit/integration tests in `test/wishlist-catalogue.test.js` (empty wishlist, ID resolution, API authority, price changes, add/remove persistence, legacy format migration, 404 gate fallback, 500 error & retry recovery, archived product omission, easter egg invariants, Shop/ProductDetail toggle wiring, Cart isolation, zero static import, empty fetch guard).
- All 208 frontend tests pass; 113 admin tests pass; all existing catalogue, auth, worker, d1, lint, and build checks pass.
- Live verification confirmed add, reload, admin price propagation, archive safe omission, restore, and remove.
- Cart, Checkout, and Orders remain untouched.
- `API_V1_ENABLED=false` remains intact; no deployment occurred.

# CURRENT ARCHITECTURE STATE

React/Vite/Sites serves the SPA through a Cloudflare Worker. Server catalogue/pricing read and mutation authority exists in D1. Media storage authority exists in Cloudflare R2 (`MEDIA_BUCKET`), with D1 storing only media references. Frontend Shop, Product Detail, SearchPage, Homepage, FlowerFinderPage, and WishlistPage load from D1 catalogue API with transitional 404 fallback. Admin UI at `/admin` loads both active and archived rows strictly from `GET /api/v1/admin/products`, edits content and commerce fields through `PATCH /api/v1/admin/products/:id`, creates through `POST /api/v1/admin/products`, soft-archives/restores through the explicit action endpoints, uploads/deletes media via `/api/v1/admin/media`, manages sizes/wrapping via `GET/PUT /api/v1/admin/products/:id/variants`, and manages gift add-ons via `/api/v1/admin/gift-add-ons`. Static `src/data/products.js` is temporarily retained for unmigrated secondary consumers (CartItems, ConciergeWidget, CommerceContext for Cart only, FlowerAlreadyTakenPage, order.js, catalogueClient.js). Clerk React provider wraps the frontend. API v1 remains globally gated closed with `API_V1_ENABLED=false`. Order history is safely preserved in `localStorage` under `hanapipi-flower:orders`. Cart and Checkout remain on existing unmigrated flows.

**`products.active` semantics**: `active` conflates BOTH visibility AND purchasability. `active = 0` hides from public catalogue AND makes non-purchasable. Archive/Delete implementation must account for this dual meaning.

**`catalogue_versions` semantics (VERIFIED — seed/package metadata only)**: `catalogue_versions` is a seed-package table, not a live mutation counter. Columns `product_count`, `purchasable_count`, `checksum`, and `seeded_at_utc` describe the seeded batch snapshot as written by the migration generator — there is no `updated_at_utc` column and no runtime bump mechanism. `products.catalogue_version_id` and `product_variants.catalogue_version_id` are FK references that record which seed package a row was seeded from, not mutation counters. The public API exposes only the opaque version string key (`version?.version`); no frontend page reads `product_count`, `purchasable_count`, or `checksum` at runtime. Admin CREATE and UPDATE mutations do NOT bump `catalogue_versions` — this is intentional and architecturally correct. A future batch-reimport or catalogue-repackage migration would insert a new `catalogue_versions` row and update seeded products' FKs.

# WHAT IS WORKING

Storefront routes and mock commerce flows exist. Catalogue invariant is 24 total / 23 purchasable / 1 priceless. Worker-based Groq concierge and local fallback exist. Clerk token verification, stable-sub D1 mapping, duplicate-safe user upsert, unauthenticated protection, frontend Clerk session, Email OTP verification, `/api/v1/me` hydration, sign-out, server-side `requireAdmin` authorization, `/api/v1/admin/me`, `/admin` route protection, D1-backed catalogue listing/detail, Admin product content and commerce editing, Admin product creation with auto-slug generation and R2-backed real image upload, Admin soft archive/restore, Admin product configuration options management (sizes, wrapping, gift add-ons), protected active+archived Admin listing, `no-watering-flower` invariant enforcement, and frontend Shop, Product Detail, SearchPage, Homepage, FlowerFinderPage, and WishlistPage catalogue API integration are verified.

# WHAT IS PARTIAL

Secondary catalogue consumers (FlowerAlreadyTakenPage, ConciergeWidget, CartItems, CommerceContext for Cart only) have not switched to D1 catalogue API yet. Hard delete is not implemented. Cart, Checkout, and Orders have not migrated to Worker/D1; static and D1 catalogues temporarily coexist.

# CURRENT BLOCKERS

None. Wishlist migration to D1 catalogue API is verified locally and `API_V1_ENABLED` remains intentionally disabled by default.

# OPEN RISKS

- Rotation/revocation status of a Groq key previously exposed in chat is UNKNOWN.
- Public deployment may lag behind the repository; parity was not verified in this task.
- `qa/` is untracked.
- README is the generic Vite template.
- `/font-diagnostic` remains exposed.

# NEXT BEST TASK

Commerce migration (Cart/Checkout/Orders) or remaining secondary consumer migration (ConciergeWidget, FlowerAlreadyTakenPage).

# LATEST VERIFIED COMMIT

Use the commit resulting from this Wishlist migration checkpoint (`Migrate Wishlist to catalogue API`) as the authoritative commit reference.

# DEPLOYMENT STATE

Sites/Worker deployment configuration exists. No deployment is performed by this task; current public parity is UNKNOWN.

# IMPORTANT NOTES

Clerk is the selected managed provider; Auth0 is not used. D1 user role is authoritative for authorization. D1 is authoritative for catalogue and pricing; frontend static data is temporary compatibility data until Phase 18 migration completes. `products.active` still conflates visibility and purchasability: restoring an archived normal product necessarily makes it visible and purchasable because the current schema has no independent pre-archive purchasability field. Hard delete is not implemented. This task does not migrate Cart, Checkout, Orders, or payments. Preserve `no-watering-flower`, the original Homepage hero, mock payments, Vietnamese UI, and current visual direction.
