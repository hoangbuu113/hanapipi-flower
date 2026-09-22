# CURRENT PHASE

Phase 18 in progress: Admin can edit core commerce fields, create normal products, and archive/restore normal products from `/admin`. Archive is a soft-delete through the current `products.active` model; hard delete is not implemented. `no-watering-flower` remains strictly protected server-side and client-side as a priceless non-purchasable product. Frontend Shop, Product Detail, SearchPage, Homepage (`#best-sellers`), and FlowerFinderPage are migrated to the D1-backed catalogue API with intentional gate fallback (`API_NOT_FOUND` → static data) and error/retry states. Static `src/data/products.js` is temporarily retained for unmigrated secondary consumers (CartItems, ConciergeWidget, CommerceContext, FlowerAlreadyTakenPage, WishlistPage, order.js, catalogueClient.js). Product detail/media/variants editing and commerce migration are still pending. API v1 remains default closed (`API_V1_ENABLED=false`).

# LAST VERIFIED TASK

Implemented server-authoritative Admin archive/restore for normal catalogue products (`PATCH /api/v1/admin/products/:id/archive` and `/restore`) plus the protected Admin list (`GET /api/v1/admin/products`). Verified:
- Every Admin read/mutation follows Clerk identity → canonical D1 user → `requireAdmin()`; guests are denied with 401 and customers with 403.
- Archive sets only `products.active = 0`; restore sets only `products.active = 1`. Product rows, price, slug, media, variants, and relations remain intact.
- The public catalogue excludes archived products while the Admin-only catalogue includes both active and archived products, so restoration remains possible without static fallback.
- Archive and restore are idempotent. Unknown products return 404 and unexpected persistence errors return a safe 5xx without SQL/stack leakage.
- `no-watering-flower` rejects both actions with `PROTECTED_PRODUCT` and remains active, priceless, and non-purchasable.
- `/admin` provides Vietnamese confirmation before archive, canonical post-response updates, disabled/loading states, success/error feedback, and protected-product controls.
- Controlled live local flow verified with a real Clerk test session and local D1: customer denied, temporary Admin role authorized archive, Admin still listed the inactive row, public catalogue hid it, restore returned it publicly, price/slug/media/variants stayed unchanged, and role/catalogue state were restored.
- `API_V1_ENABLED=false` was restored after live verification; no deployment occurred.

# CURRENT ARCHITECTURE STATE

React/Vite/Sites serves the SPA through a Cloudflare Worker. Server catalogue/pricing read and mutation authority exists in D1. Frontend Shop, Product Detail, SearchPage, Homepage, and FlowerFinderPage load from D1 catalogue API with transitional 404 fallback. Admin UI at `/admin` loads both active and archived rows strictly from `GET /api/v1/admin/products`, edits through `PATCH /api/v1/admin/products/:id`, creates through `POST /api/v1/admin/products`, and soft-archives/restores through the explicit action endpoints. Static `src/data/products.js` is temporarily retained for unmigrated secondary consumers (CartItems, ConciergeWidget, CommerceContext, FlowerAlreadyTakenPage, WishlistPage, order.js, catalogueClient.js). Clerk React provider wraps the frontend. API v1 remains globally gated closed with `API_V1_ENABLED=false`. Order history is safely preserved in `localStorage` under `hanapipi-flower:orders`. Commerce (Cart, Wishlist, Checkout) remains on existing unmigrated flows.

**`products.active` semantics**: `active` conflates BOTH visibility AND purchasability. `active = 0` hides from public catalogue AND makes non-purchasable. Archive/Delete implementation must account for this dual meaning.

**`catalogue_versions` semantics (VERIFIED — seed/package metadata only)**: `catalogue_versions` is a seed-package table, not a live mutation counter. Columns `product_count`, `purchasable_count`, `checksum`, and `seeded_at_utc` describe the seeded batch snapshot as written by the migration generator — there is no `updated_at_utc` column and no runtime bump mechanism. `products.catalogue_version_id` and `product_variants.catalogue_version_id` are FK references that record which seed package a row was seeded from, not mutation counters. The public API exposes only the opaque version string key (`version?.version`); no frontend page reads `product_count`, `purchasable_count`, or `checksum` at runtime. Admin CREATE and UPDATE mutations do NOT bump `catalogue_versions` — this is intentional and architecturally correct. A future batch-reimport or catalogue-repackage migration would insert a new `catalogue_versions` row and update seeded products' FKs.

# WHAT IS WORKING

Storefront routes and mock commerce flows exist. Catalogue invariant is 24 total / 23 purchasable / 1 priceless. Worker-based Groq concierge and local fallback exist. Clerk token verification, stable-sub D1 mapping, duplicate-safe user upsert, unauthenticated protection, frontend Clerk session, Email OTP verification, `/api/v1/me` hydration, sign-out, server-side `requireAdmin` authorization, `/api/v1/admin/me`, `/admin` route protection, D1-backed catalogue listing/detail, Admin product commerce editing, Admin product creation, Admin soft archive/restore, protected active+archived Admin listing, `no-watering-flower` invariant enforcement, and frontend Shop, Product Detail, SearchPage, Homepage, and FlowerFinderPage catalogue API integration are verified.

# WHAT IS PARTIAL

Secondary catalogue consumers (FlowerAlreadyTakenPage, ConciergeWidget, WishlistPage, CartItems, CommerceContext) have not switched to D1 catalogue API yet. Hard delete and product detail/media/variants editing are not implemented. Cart, Wishlist, Checkout, and Orders have not migrated to Worker/D1; static and D1 catalogues temporarily coexist.

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
