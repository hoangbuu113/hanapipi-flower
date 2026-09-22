# CURRENT PHASE

Phase 18 in progress: Admin can now CREATE new catalogue products (`POST /api/v1/admin/products`) as well as edit core commerce fields (`PATCH /api/v1/admin/products/:id`) from `/admin`. `no-watering-flower` is strictly protected server-side and client-side as a priceless non-purchasable product. Frontend Shop, Product Detail, SearchPage, Homepage (`#best-sellers`), and FlowerFinderPage are migrated to the D1-backed catalogue API with intentional gate fallback (`API_NOT_FOUND` → static data) and error/retry states. Static `src/data/products.js` is temporarily retained for unmigrated secondary consumers (CartItems, ConciergeWidget, CommerceContext, FlowerAlreadyTakenPage, WishlistPage, order.js, catalogueClient.js). Delete/Archive products, variants/media editing, and commerce migration are not implemented yet. API v1 remains default closed (`API_V1_ENABLED=false`).

# LAST VERIFIED TASK

Implemented server-authoritative admin product creation (`POST /api/v1/admin/products`) from `/admin` (`src/server/repositories/catalogueRepository.js`, `src/server/api.js`, `src/services/adminClient.js`, `src/pages/AdminPage.jsx`, `src/pages/AdminPage.css`, `test/admin-dashboard.test.js`). Verified:
- `POST /api/v1/admin/products` is strictly protected by `requireAdmin` server-side via Clerk identity mapping to D1 `users.role = 'admin'`. Guests return 401, customers return 403.
- Payload whitelisted: `name`, `slug` (auto-lowercased, URL-safe regex, ≤100 chars, uniqueness-checked), `priceVnd` (positive integer), `status` ∈ `{available, seasonal, preorder}`, optional `collection`, `shortDescription`, `imageUrl`, `isPurchasable`.
- `no-watering-flower` slug and `purchaseType: 'priceless'` are rejected at both API and repository layers (400 `PROTECTED_PRODUCT`). Duplicate slug rejected with 409 `SLUG_EXISTS`.
- Product + default size variant (`Tiêu chuẩn`) inserted atomically via `db.batch()` under the active `catalogue_version_id`.
- `normalizeCatalogueProduct` in `catalogueClient.js` safely handles media-less products (empty-src fallback image) to prevent ProductCard crash.
- Admin UI "Thêm sản phẩm" panel auto-generates slug from Vietnamese product name (NFD normalization) and allows manual override. Prepends new product to admin list on success.
- Controlled live D1 flow verified: customer POST → 403, admin create → 201 (hoa-cuc-mat-troi, 520.000 ₫), public catalogue returns new product with default variant, temp product deleted cleanly, catalogue restored to 24 products / 115 variants, user restored to customer role.
- All 42/42 admin tests pass; all 117 frontend tests pass; lint clean (0 errors, 0 warnings); production build clean.
- `API_V1_ENABLED=false` preserved as repository default.

# CURRENT ARCHITECTURE STATE

React/Vite/Sites serves the SPA through a Cloudflare Worker. Server catalogue/pricing read and mutation authority exists in D1. Frontend Shop, Product Detail, SearchPage, Homepage, and FlowerFinderPage load from D1 catalogue API with transitional 404 fallback. Admin UI at `/admin` loads strictly from D1 catalogue API and mutates via `PATCH /api/v1/admin/products/:id` (edit) and `POST /api/v1/admin/products` (create). Static `src/data/products.js` is temporarily retained for unmigrated secondary consumers (CartItems, ConciergeWidget, CommerceContext, FlowerAlreadyTakenPage, WishlistPage, order.js, catalogueClient.js). Clerk React provider wraps the frontend. API v1 remains globally gated closed with `API_V1_ENABLED=false`. Order history is safely preserved in `localStorage` under `hanapipi-flower:orders`. Commerce (Cart, Wishlist, Checkout) remains on existing unmigrated flows.

**`products.active` semantics**: `active` conflates BOTH visibility AND purchasability. `active = 0` hides from public catalogue AND makes non-purchasable. Archive/Delete implementation must account for this dual meaning.

**`catalogue_versions` semantics (VERIFIED — seed/package metadata only)**: `catalogue_versions` is a seed-package table, not a live mutation counter. Columns `product_count`, `purchasable_count`, `checksum`, and `seeded_at_utc` describe the seeded batch snapshot as written by the migration generator — there is no `updated_at_utc` column and no runtime bump mechanism. `products.catalogue_version_id` and `product_variants.catalogue_version_id` are FK references that record which seed package a row was seeded from, not mutation counters. The public API exposes only the opaque version string key (`version?.version`); no frontend page reads `product_count`, `purchasable_count`, or `checksum` at runtime. Admin CREATE and UPDATE mutations do NOT bump `catalogue_versions` — this is intentional and architecturally correct. A future batch-reimport or catalogue-repackage migration would insert a new `catalogue_versions` row and update seeded products' FKs.

# WHAT IS WORKING

Storefront routes and mock commerce flows exist. Catalogue invariant is 24 total / 23 purchasable / 1 priceless. Worker-based Groq concierge and local fallback exist. Clerk token verification, stable-sub D1 mapping, duplicate-safe user upsert, unauthenticated protection, frontend Clerk session, Email OTP verification, `/api/v1/me` hydration, sign-out, server-side `requireAdmin` authorization, `/api/v1/admin/me`, `/admin` route protection, D1-backed catalogue listing, D1-backed product detail endpoints, read-only Admin D1 catalogue view, Admin product commerce editing (`PATCH /api/v1/admin/products/:id`), Admin product creation (`POST /api/v1/admin/products`), `no-watering-flower` invariant enforcement, and frontend Shop, Product Detail, SearchPage, Homepage, and FlowerFinderPage catalogue API integration are verified.

# WHAT IS PARTIAL

Secondary catalogue consumers (FlowerAlreadyTakenPage, ConciergeWidget, WishlistPage, CartItems, CommerceContext) have not switched to D1 catalogue API yet. Delete/Archive product, variants/media editing are not implemented yet. Cart, Wishlist, Checkout, and Orders have not migrated to Worker/D1; static and D1 catalogues temporarily coexist.

# CURRENT BLOCKERS

None. Admin product creation is verified and all test suites pass. `API_V1_ENABLED` remains intentionally disabled by default.

# OPEN RISKS

- Rotation/revocation status of a Groq key previously exposed in chat is UNKNOWN.
- Public deployment may lag behind the repository; parity was not verified in this task.
- `qa/` is untracked.
- README is the generic Vite template.
- `/font-diagnostic` remains exposed.

# NEXT BEST TASK

Phase 18J: Implement Admin Delete/Archive product (`DELETE` or `PATCH active=0` on `/api/v1/admin/products/:id`), respecting `no-watering-flower` protection and `products.active` dual-meaning semantics.

# LATEST VERIFIED COMMIT

Use the commit resulting from this Admin product creation checkpoint (`Add admin product creation`) as the authoritative commit reference.

# DEPLOYMENT STATE

Sites/Worker deployment configuration exists. No deployment is performed by this task; current public parity is UNKNOWN.

# IMPORTANT NOTES

Clerk is the selected managed provider; Auth0 is not used. D1 user role is authoritative for authorization. D1 is authoritative for catalogue and pricing; frontend static data is temporary compatibility data until Phase 18 migration completes. `products.active` conflates visibility and purchasability — Archive/Delete must account for this. This task does NOT build Delete/Archive product and does not migrate Cart, Wishlist, Checkout, Orders, or payments. Preserve `no-watering-flower`, the original Homepage hero, mock payments, Vietnamese UI, and current visual direction.
