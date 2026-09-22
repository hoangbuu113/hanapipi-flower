# CURRENT PHASE

Phase 18 in progress: Cart product/variant/option resolution is migrated to the D1-backed catalogue API (`resolveCartItems` via `fetchProductDetail`). Local cart persistence remains in `localStorage` under `hanapipi-flower:cart` storing only stable selections (`productId`, `sizeId`, `wrappingId`, `giftAddOns`, `quantity`, `custom`). All product names, variant prices, wrapping options, gift add-on prices, media, and purchasability are resolved dynamically from canonical D1 data. Cart displayed totals use canonical D1 pricing. Admin can edit full non-media, non-option product content, edit core commerce fields, create normal products, archive/restore normal products, and manage product configuration options (sizes & prices, wrapping options, and gift add-ons) from `/admin`. Product creation/editing UX features automatic Vietnamese-safe URL slug generation and device-based R2 image upload. Product options are server-authoritative and atomic via D1 batch operations. Archive is a soft-delete through the current `products.active` model; hard delete is not implemented. `no-watering-flower` remains strictly protected server-side and client-side as a priceless non-purchasable product with variants protected from mutation. Frontend Shop, Product Detail, SearchPage, Homepage (`#best-sellers`), FlowerFinderPage, WishlistPage, and Cart are migrated to the D1-backed catalogue API with intentional gate fallback (`API_NOT_FOUND` → static data) and error/retry states. Static `src/data/products.js` is temporarily retained for unmigrated secondary consumers (ConciergeWidget, FlowerAlreadyTakenPage, order.js, catalogueClient.js). Non-media full product detail editing is complete; commerce migration (Checkout, Orders) is still pending. API v1 remains default closed (`API_V1_ENABLED=false`).

# LAST VERIFIED TASK

Migrated Cart to D1 Catalogue API:
- Cart product/variant/option resolution severed from static `src/data/products.js`; `CommerceContext.jsx` and `CartItems.jsx` now resolve canonical product, variant, wrapping, and gift add-on data via `resolveCartItems` and `fetchProductDetail`.
- Persistence remains local in `localStorage` (`hanapipi-flower:cart`) as selection identifiers (`productId`, `sizeId`, `wrappingId`, `giftAddOns`, `quantity`, `custom`).
- Created `src/utils/cartStorage.js` with `normalizeStoredCartItem` and `normalizeStoredCartItems` to safely read and normalize legacy stored formats (nested objects, strings, snapshot prices) without dropping items or inventing values.
- Price authority: variant prices, gift add-on prices, and line totals reflect live D1 database state. Admin variant price changes propagate automatically upon cart reload.
- Unavailable states:
  - Archived products (`active = 0`): marked `Sản phẩm hiện không còn mở bán`, cannot increase quantity or checkout, omitted from subtotal, removable by user, not resurrected from static data.
  - Missing/deactivated variant: marked `Kích thước đã chọn không còn khả dụng.`
  - Missing/deactivated wrapping: marked `Kiểu gói đã chọn không còn khả dụng.`
  - Deactivated gift add-on: excluded from pricing (0 ₫) with `(Hết quà tặng, không tính phí)` notice.
  - `no-watering-flower`: priceless (`Giá: Vô giá`), non-purchasable, cannot be checked out.
- Async states: initial loading, error with retry, empty cart, and resolved cart with available/unavailable items.
- 26/26 unit/integration tests in `test/cart-catalogue.test.js` pass; 234 frontend tests pass; full test suite passes.
- Live verification confirmed add, reload, admin price propagation, archive unavailable notice, restore, variant toggle, and remove.
- Checkout and Orders remain unmigrated.
- `API_V1_ENABLED=false` remains intact; no deployment occurred.

# CURRENT ARCHITECTURE STATE

React/Vite/Sites serves the SPA through a Cloudflare Worker. Server catalogue/pricing read and mutation authority exists in D1. Media storage authority exists in Cloudflare R2 (`MEDIA_BUCKET`), with D1 storing only media references. Frontend Shop, Product Detail, SearchPage, Homepage, FlowerFinderPage, WishlistPage, and Cart load from D1 catalogue API with transitional 404 fallback. Admin UI at `/admin` loads both active and archived rows strictly from `GET /api/v1/admin/products`, edits content and commerce fields through `PATCH /api/v1/admin/products/:id`, creates through `POST /api/v1/admin/products`, soft-archives/restores through the explicit action endpoints, uploads/deletes media via `/api/v1/admin/media`, manages sizes/wrapping via `GET/PUT /api/v1/admin/products/:id/variants`, and manages gift add-ons via `/api/v1/admin/gift-add-ons`. Static `src/data/products.js` is temporarily retained for unmigrated secondary consumers (ConciergeWidget, FlowerAlreadyTakenPage, order.js, catalogueClient.js). Clerk React provider wraps the frontend. API v1 remains globally gated closed with `API_V1_ENABLED=false`. Order history is safely preserved in `localStorage` under `hanapipi-flower:orders`. Checkout and Orders remain on existing unmigrated flows.

**`products.active` semantics**: `active` conflates BOTH visibility AND purchasability. `active = 0` hides from public catalogue AND makes non-purchasable. Archive/Delete implementation must account for this dual meaning.

**`catalogue_versions` semantics (VERIFIED — seed/package metadata only)**: `catalogue_versions` is a seed-package table, not a live mutation counter. Columns `product_count`, `purchasable_count`, `checksum`, and `seeded_at_utc` describe the seeded batch snapshot as written by the migration generator — there is no `updated_at_utc` column and no runtime bump mechanism. `products.catalogue_version_id` and `product_variants.catalogue_version_id` are FK references that record which seed package a row was seeded from, not mutation counters. The public API exposes only the opaque version string key (`version?.version`); no frontend page reads `product_count`, `purchasable_count`, or `checksum` at runtime. Admin CREATE and UPDATE mutations do NOT bump `catalogue_versions` — this is intentional and architecturally correct. A future batch-reimport or catalogue-repackage migration would insert a new `catalogue_versions` row and update seeded products' FKs.

# WHAT IS WORKING

Storefront routes and mock commerce flows exist. Catalogue invariant is 24 total / 23 purchasable / 1 priceless. Worker-based Groq concierge and local fallback exist. Clerk token verification, stable-sub D1 mapping, duplicate-safe user upsert, unauthenticated protection, frontend Clerk session, Email OTP verification, `/api/v1/me` hydration, sign-out, server-side `requireAdmin` authorization, `/api/v1/admin/me`, `/admin` route protection, D1-backed catalogue listing/detail, Admin product content and commerce editing, Admin product creation with auto-slug generation and R2-backed real image upload, Admin soft archive/restore, Admin product configuration options management (sizes, wrapping, gift add-ons), protected active+archived Admin listing, `no-watering-flower` invariant enforcement, and frontend Shop, Product Detail, SearchPage, Homepage, FlowerFinderPage, WishlistPage, and Cart catalogue API integration are verified.

# WHAT IS PARTIAL

Secondary catalogue consumers (FlowerAlreadyTakenPage, ConciergeWidget) have not switched to D1 catalogue API yet. Hard delete is not implemented. Checkout and Orders have not migrated to Worker/D1; static and D1 catalogues temporarily coexist.

# CURRENT BLOCKERS

None. Cart migration to D1 catalogue API is verified locally and `API_V1_ENABLED` remains intentionally disabled by default.

# OPEN RISKS

- Rotation/revocation status of a Groq key previously exposed in chat is UNKNOWN.
- Public deployment may lag behind the repository; parity was not verified in this task.
- `qa/` is untracked.
- README is the generic Vite template.
- `/font-diagnostic` remains exposed.

# NEXT BEST TASK

Checkout server-authoritative order preparation only.

# LATEST VERIFIED COMMIT

Use the commit resulting from this Cart migration checkpoint (`Migrate Cart to catalogue authority`) as the authoritative commit reference.

# DEPLOYMENT STATE

Sites/Worker deployment configuration exists. No deployment is performed by this task; current public parity is UNKNOWN.

# IMPORTANT NOTES

Clerk is the selected managed provider; Auth0 is not used. D1 user role is authoritative for authorization. D1 is authoritative for catalogue and pricing; frontend static data is temporary compatibility data until Phase 18 migration completes. `products.active` still conflates visibility and purchasability: restoring an archived normal product necessarily makes it visible and purchasable because the current schema has no independent pre-archive purchasability field. Hard delete is not implemented. This task does not migrate Checkout, Orders, or payments. Preserve `no-watering-flower`, the original Homepage hero, mock payments, Vietnamese UI, and current visual direction.
