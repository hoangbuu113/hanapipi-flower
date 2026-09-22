# CURRENT PHASE

Phase 18 in progress: Admin product commerce editing exists (`PATCH /api/v1/admin/products/:id`) allowing authorized admins to edit price, status, and purchasability from `/admin`. `no-watering-flower` is strictly protected server-side and client-side as a priceless non-purchasable product. Frontend Shop, Product Detail, SearchPage, Homepage (`#best-sellers`), and FlowerFinderPage are migrated to the D1-backed catalogue API with intentional gate fallback (`API_NOT_FOUND` → static data) and error/retry states. Static `src/data/products.js` is temporarily retained for unmigrated secondary consumers (CartItems, ConciergeWidget, CommerceContext, FlowerAlreadyTakenPage, WishlistPage, order.js, catalogueClient.js). Add/Delete products, variants/media editing, and commerce migration are not implemented yet. API v1 remains default closed (`API_V1_ENABLED=false`).

# LAST VERIFIED TASK

Implemented server-authoritative admin product editing (`PATCH /api/v1/admin/products/:id`) from `/admin` (`src/server/repositories/catalogueRepository.js`, `src/server/api.js`, `src/services/adminClient.js`, `src/pages/AdminPage.jsx`, `src/pages/AdminPage.css`, `test/admin-dashboard.test.js`). Verified:
- `PATCH /api/v1/admin/products/:id` is strictly protected by `requireAdmin` server-side via Clerk identity mapping to D1 `users.role = 'admin'`. Guests return 401, customers return 403.
- Whitelisted fields: only `priceVnd`, `status`, and `isPurchasable` (mapped to `active`) are editable.
- Positive integer VND price validation is strictly enforced; invalid prices (<= 0, float, string) are rejected with 400 `INVALID_PRICE`.
- `no-watering-flower` invariant is strictly preserved: attempts to assign numeric price or set `isPurchasable = true` are rejected with 400 `PROTECTED_PRODUCT`. Price remains `null` in D1.
- Admin UI provides inline row editing with loading/saving state, inline validation error, cancellation, and success banner; reconciles canonical server response without optimistic assumptions.
- Controlled live D1 flow verified: customer denied (403), admin price update persisted in D1 (777.000 ₫), public catalogue endpoint `/api/v1/catalogue/products/nang-diu` reflected updated price, original price (590.000 ₫) and user role (customer) cleanly restored.
- All 26/26 admin tests pass; all 101 frontend tests across 7 suites pass; lint clean (0 errors, 0 warnings); production build clean; dev server smoke tests 200 on all 8 routes.
- `API_V1_ENABLED=false` preserved as repository default.

# CURRENT ARCHITECTURE STATE

React/Vite/Sites serves the SPA through a Cloudflare Worker. Server catalogue/pricing read and mutation authority exists in D1. Frontend Shop, Product Detail, SearchPage, Homepage, and FlowerFinderPage load from D1 catalogue API with transitional 404 fallback. Admin UI at `/admin` loads strictly from D1 catalogue API and mutates via `PATCH /api/v1/admin/products/:id`. Static `src/data/products.js` is temporarily retained for unmigrated secondary consumers (CartItems, ConciergeWidget, CommerceContext, FlowerAlreadyTakenPage, WishlistPage, order.js, catalogueClient.js). Clerk React provider wraps the frontend. API v1 remains globally gated closed with `API_V1_ENABLED=false`. Order history is safely preserved in `localStorage` under `hanapipi-flower:orders`. Commerce (Cart, Wishlist, Checkout) remains on existing unmigrated flows.

# WHAT IS WORKING

Storefront routes and mock commerce flows exist. Catalogue invariant is 24 total / 23 purchasable / 1 priceless. Worker-based Groq concierge and local fallback exist. Clerk token verification, stable-sub D1 mapping, duplicate-safe user upsert, unauthenticated protection, frontend Clerk session, Email OTP verification, `/api/v1/me` hydration, sign-out, server-side `requireAdmin` authorization, `/api/v1/admin/me`, `/admin` route protection, D1-backed catalogue listing, D1-backed product detail endpoints, read-only Admin D1 catalogue view, Admin product commerce editing (`PATCH /api/v1/admin/products/:id`), `no-watering-flower` invariant enforcement, and frontend Shop, Product Detail, SearchPage, Homepage, and FlowerFinderPage catalogue API integration are verified.

# WHAT IS PARTIAL

Secondary catalogue consumers (FlowerAlreadyTakenPage, ConciergeWidget, WishlistPage, CartItems, CommerceContext) have not switched to D1 catalogue API yet. Add Product, Delete Product, variants/media editing are not implemented yet. Cart, Wishlist, Checkout, and Orders have not migrated to Worker/D1; static and D1 catalogues temporarily coexist.

# CURRENT BLOCKERS

None. Admin product commerce editing is verified and all test suites pass. `API_V1_ENABLED` remains intentionally disabled by default.

# OPEN RISKS

- Rotation/revocation status of a Groq key previously exposed in chat is UNKNOWN.
- Public deployment may lag behind the repository; parity was not verified in this task.
- `qa/` is untracked.
- README is the generic Vite template.
- `/font-diagnostic` remains exposed.

# NEXT BEST TASK

Phase 18I: Migrate FlowerAlreadyTakenPage or ConciergeWidget to the D1 catalogue API, or add admin variant/inventory editing.

# LATEST VERIFIED COMMIT

Use the commit resulting from this Admin product editing checkpoint as the authoritative commit reference.

# DEPLOYMENT STATE

Sites/Worker deployment configuration exists. No deployment is performed by this task; current public parity is UNKNOWN.

# IMPORTANT NOTES

Clerk is the selected managed provider; Auth0 is not used. D1 user role is authoritative for authorization. D1 is authoritative for catalogue and pricing; frontend static data is temporary compatibility data until Phase 18 migration completes. This task does NOT build Add/Delete product and does not migrate Cart, Wishlist, Checkout, Orders, or payments. Preserve `no-watering-flower`, the original Homepage hero, mock payments, Vietnamese UI, and current visual direction.
