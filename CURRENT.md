# CURRENT PHASE

Phase 18 in progress: Admin can edit full non-media, non-option product content (`name`, `shortDescription`, `description`, `collection`, `careNote`, `deliveryNote`, `internalNote`, `composition`, `occasions`, `moods`, `colors`), edit core commerce fields, create normal products, archive/restore normal products, and manage product configuration options (sizes & prices, wrapping options, and gift add-ons) from `/admin`. Product creation/editing UX features automatic Vietnamese-safe URL slug generation and device-based R2 image upload. Product options are server-authoritative and atomic via D1 batch operations. Archive is a soft-delete through the current `products.active` model; hard delete is not implemented. `no-watering-flower` remains strictly protected server-side and client-side as a priceless non-purchasable product with variants protected from mutation. Frontend Shop, Product Detail, SearchPage, Homepage (`#best-sellers`), and FlowerFinderPage are migrated to the D1-backed catalogue API with intentional gate fallback (`API_NOT_FOUND` → static data) and error/retry states. Static `src/data/products.js` is temporarily retained for unmigrated secondary consumers (CartItems, ConciergeWidget, CommerceContext, FlowerAlreadyTakenPage, WishlistPage, order.js, catalogueClient.js). Non-media full product detail editing is complete; commerce migration is still pending. API v1 remains default closed (`API_V1_ENABLED=false`).

# LAST VERIFIED TASK

Implemented Full Admin Product Content Editing:
- Authorized Admins can edit full non-media, non-option product content from `/admin` via modal dialog organized into 5 structured sections:
  1. Thông tin cơ bản (`name`, `priceVnd`, `status`, `isPurchasable`, read-only `slug`).
  2. Nội dung hiển thị (`shortDescription` / Mô tả ngắn - customer-facing under price; `description` / Mô tả chi tiết & câu chuyện; `collection` / Bộ sưu tập).
  3. Thông tin hoa (`composition` / Thành phần hoa, `occasions` / Dịp tặng, `moods` / Phong cách & cảm xúc, `colors` / Bảng màu).
  4. Thông tin giao/chăm sóc (`careNote` / Hướng dẫn chăm sóc, `deliveryNote` / Thông tin giao hoa).
  5. Ghi chú nội bộ (`internalNote` / Ghi chú nội bộ - ADMIN-ONLY).
- Stored `internal_note` in D1 `products` table via migration `0003_add_product_internal_note.sql`.
- Strictly segregated Admin vs Public DTOs: `mapProduct(row)` omits `internalNote` completely, while `mapAdminProduct(row)` returns `internalNote`.
- Tested and verified that public endpoints (`/api/v1/catalogue/products`, `/api/v1/catalogue/products/:slug`) and `ProductDetailPage.jsx` NEVER leak `internalNote`.
- ProductDetailPage story text below price displays `product.shortDescription || product.description` with `white-space: pre-line` for preserved formatting.
- Editing an archived product (`active = 0`) does NOT restore it automatically.
- `no-watering-flower` hard invariants preserved: priceless, non-purchasable, protected slug.
- 113/113 admin tests pass; all existing storefront, auth, catalogue, worker, d1, lint, and build checks pass.
- `API_V1_ENABLED=false` remains intact; no deployment occurred.

# CURRENT ARCHITECTURE STATE

React/Vite/Sites serves the SPA through a Cloudflare Worker. Server catalogue/pricing read and mutation authority exists in D1. Media storage authority exists in Cloudflare R2 (`MEDIA_BUCKET`), with D1 storing only media references. Frontend Shop, Product Detail, SearchPage, Homepage, and FlowerFinderPage load from D1 catalogue API with transitional 404 fallback. Admin UI at `/admin` loads both active and archived rows strictly from `GET /api/v1/admin/products`, edits content and commerce fields through `PATCH /api/v1/admin/products/:id`, creates through `POST /api/v1/admin/products`, soft-archives/restores through the explicit action endpoints, uploads/deletes media via `/api/v1/admin/media`, manages sizes/wrapping via `GET/PUT /api/v1/admin/products/:id/variants`, and manages gift add-ons via `/api/v1/admin/gift-add-ons`. Static `src/data/products.js` is temporarily retained for unmigrated secondary consumers (CartItems, ConciergeWidget, CommerceContext, FlowerAlreadyTakenPage, WishlistPage, order.js, catalogueClient.js). Clerk React provider wraps the frontend. API v1 remains globally gated closed with `API_V1_ENABLED=false`. Order history is safely preserved in `localStorage` under `hanapipi-flower:orders`. Commerce (Cart, Wishlist, Checkout) remains on existing unmigrated flows.

**`products.active` semantics**: `active` conflates BOTH visibility AND purchasability. `active = 0` hides from public catalogue AND makes non-purchasable. Archive/Delete implementation must account for this dual meaning.

**`catalogue_versions` semantics (VERIFIED — seed/package metadata only)**: `catalogue_versions` is a seed-package table, not a live mutation counter. Columns `product_count`, `purchasable_count`, `checksum`, and `seeded_at_utc` describe the seeded batch snapshot as written by the migration generator — there is no `updated_at_utc` column and no runtime bump mechanism. `products.catalogue_version_id` and `product_variants.catalogue_version_id` are FK references that record which seed package a row was seeded from, not mutation counters. The public API exposes only the opaque version string key (`version?.version`); no frontend page reads `product_count`, `purchasable_count`, or `checksum` at runtime. Admin CREATE and UPDATE mutations do NOT bump `catalogue_versions` — this is intentional and architecturally correct. A future batch-reimport or catalogue-repackage migration would insert a new `catalogue_versions` row and update seeded products' FKs.

# WHAT IS WORKING

Storefront routes and mock commerce flows exist. Catalogue invariant is 24 total / 23 purchasable / 1 priceless. Worker-based Groq concierge and local fallback exist. Clerk token verification, stable-sub D1 mapping, duplicate-safe user upsert, unauthenticated protection, frontend Clerk session, Email OTP verification, `/api/v1/me` hydration, sign-out, server-side `requireAdmin` authorization, `/api/v1/admin/me`, `/admin` route protection, D1-backed catalogue listing/detail, Admin product content and commerce editing, Admin product creation with auto-slug generation and R2-backed real image upload, Admin soft archive/restore, Admin product configuration options management (sizes, wrapping, gift add-ons), protected active+archived Admin listing, `no-watering-flower` invariant enforcement, and frontend Shop, Product Detail, SearchPage, Homepage, and FlowerFinderPage catalogue API integration are verified.

# WHAT IS PARTIAL

Secondary catalogue consumers (FlowerAlreadyTakenPage, ConciergeWidget, WishlistPage, CartItems, CommerceContext) have not switched to D1 catalogue API yet. Hard delete is not implemented. Cart, Wishlist, Checkout, and Orders have not migrated to Worker/D1; static and D1 catalogues temporarily coexist.

# CURRENT BLOCKERS

None. Admin full product content editing is verified locally and `API_V1_ENABLED` remains intentionally disabled by default.

# OPEN RISKS

- Rotation/revocation status of a Groq key previously exposed in chat is UNKNOWN.
- Public deployment may lag behind the repository; parity was not verified in this task.
- `qa/` is untracked.
- README is the generic Vite template.
- `/font-diagnostic` remains exposed.

# NEXT BEST TASK

Commerce migration (Cart/Checkout/Orders) or remaining secondary consumer migration.

# LATEST VERIFIED COMMIT

Use the commit resulting from this Admin product content editing checkpoint (`Add full admin product content editing`) as the authoritative commit reference.

# DEPLOYMENT STATE

Sites/Worker deployment configuration exists. No deployment is performed by this task; current public parity is UNKNOWN.

# IMPORTANT NOTES

Clerk is the selected managed provider; Auth0 is not used. D1 user role is authoritative for authorization. D1 is authoritative for catalogue and pricing; frontend static data is temporary compatibility data until Phase 18 migration completes. `products.active` still conflates visibility and purchasability: restoring an archived normal product necessarily makes it visible and purchasable because the current schema has no independent pre-archive purchasability field. Hard delete is not implemented. This task does not migrate Cart, Wishlist, Checkout, Orders, or payments. Preserve `no-watering-flower`, the original Homepage hero, mock payments, Vietnamese UI, and current visual direction.
