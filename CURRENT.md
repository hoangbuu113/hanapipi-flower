# CURRENT PHASE

Phase 18 in progress: Admin UI foundation exists at `/admin` with server-authoritative access (`/api/v1/admin/me`) and read-only D1 catalogue management view (`/api/v1/catalogue/products`). Frontend Shop, Product Detail, SearchPage, Homepage (`#best-sellers`), and FlowerFinderPage are migrated to the D1-backed catalogue API with intentional gate fallback (`API_NOT_FOUND` → static data) and error/retry states. Static `src/data/products.js` is temporarily retained for unmigrated secondary consumers (CartItems, ConciergeWidget, CommerceContext, FlowerAlreadyTakenPage, WishlistPage, order.js, catalogueClient.js). Admin CRUD/mutations are NOT implemented yet; commerce migration is not started. API v1 remains default closed (`API_V1_ENABLED=false`).

# LAST VERIFIED TASK

Implemented server-authoritative Admin UI foundation (`/admin`) with read-only D1 catalogue management view (`src/pages/AdminPage.jsx`, `src/pages/AdminPage.css`, `src/services/adminClient.js`, `src/App.jsx`, `src/components/Navbar.jsx`, `test/admin-dashboard.test.js`, `package.json`). Verified:
- `/admin` is strictly protected by server-authoritative `checkAdminAccess` calling `GET /api/v1/admin/me` with Clerk session token.
- Server `requireAdmin` verifies Clerk token, maps to canonical D1 user, and enforces `users.role = 'admin'`. No client metadata, query params, or localStorage roles are trusted.
- Unauthenticated users are redirected to `/login`.
- Authenticated customers (403 `FORBIDDEN`) see a safe "Không có quyền truy cập" state with navigation links; no catalogue content is ever rendered or leaked.
- D1-authorized admins see "Quản lý Hanapipi", admin identity summary (D1 ID, role, status, email), and read-only D1 catalogue view.
- Admin catalogue view is genuinely D1-backed via `fetchAdminCatalogue` without static fallback; fails safely if API is disabled or unavailable.
- Product count is 24 products total (23 standard purchasable, 1 priceless).
- `nang-diu` renders canonical D1 price of 590.000 ₫ (not static 620.000 ₫).
- `no-watering-flower` renders as "Vô giá", "Không mở bán", with special indicator "Sản phẩm vô giá - Được bảo vệ".
- No fake edit/add/delete actions exist.
- Navbar displays "Quản trị" link ONLY for verified D1 admin users (`user?.role === 'admin'`).
- All 14/14 admin tests pass; all 89 frontend tests across 7 suites pass; lint clean (0 errors, 0 warnings); production build clean; local D1 live verification verified.
- `API_V1_ENABLED=false` preserved as repository default.

# CURRENT ARCHITECTURE STATE

React/Vite/Sites serves the SPA through a Cloudflare Worker. Server catalogue/pricing read authority exists in D1. Frontend Shop, Product Detail, SearchPage, Homepage, and FlowerFinderPage load from D1 catalogue API with transitional 404 fallback. Admin UI at `/admin` loads strictly from D1 catalogue API without static fallback. Static `src/data/products.js` is temporarily retained for unmigrated secondary consumers (CartItems, ConciergeWidget, CommerceContext, FlowerAlreadyTakenPage, WishlistPage, order.js, catalogueClient.js). Clerk React provider wraps the frontend. API v1 remains globally gated closed with `API_V1_ENABLED=false`. Order history is safely preserved in `localStorage` under `hanapipi-flower:orders`. Commerce (Cart, Wishlist, Checkout) remains on existing unmigrated flows.

# WHAT IS WORKING

Storefront routes and mock commerce flows exist. Catalogue invariant is 24 total / 23 purchasable / 1 priceless. Worker-based Groq concierge and local fallback exist. Clerk token verification, stable-sub D1 mapping, duplicate-safe user upsert, unauthenticated protection, frontend Clerk session, Email OTP verification, `/api/v1/me` hydration, sign-out, server-side `requireAdmin` authorization, `/api/v1/admin/me`, `/admin` route protection, D1-backed catalogue listing, D1-backed product detail endpoints, read-only Admin D1 catalogue view, and frontend Shop, Product Detail, SearchPage, Homepage, and FlowerFinderPage catalogue API integration are verified.

# WHAT IS PARTIAL

Secondary catalogue consumers (FlowerAlreadyTakenPage, ConciergeWidget, WishlistPage, CartItems, CommerceContext) have not switched to D1 catalogue API yet. Admin CRUD/product mutations (create/update/delete) are not implemented yet. Cart, Wishlist, Checkout, and Orders have not migrated to Worker/D1; static and D1 catalogues temporarily coexist.

# CURRENT BLOCKERS

None. Admin UI foundation and D1 catalogue management view are verified and all test suites pass. `API_V1_ENABLED` remains intentionally disabled by default.

# OPEN RISKS

- Rotation/revocation status of a Groq key previously exposed in chat is UNKNOWN.
- Public deployment may lag behind the repository; parity was not verified in this task.
- `qa/` is untracked.
- README is the generic Vite template.
- `/font-diagnostic` remains exposed.

# NEXT BEST TASK

Phase 18H: Migrate FlowerAlreadyTakenPage or ConciergeWidget to the D1 catalogue API, or begin Admin product mutations foundation.

# LATEST VERIFIED COMMIT

Use the commit resulting from this Admin dashboard foundation checkpoint as the authoritative commit reference.

# DEPLOYMENT STATE

Sites/Worker deployment configuration exists. No deployment is performed by this task; current public parity is UNKNOWN.

# IMPORTANT NOTES

Clerk is the selected managed provider; Auth0 is not used. D1 user role is authoritative for authorization. D1 is authoritative for catalogue and pricing; frontend static data is temporary compatibility data until Phase 18 migration completes. This task does NOT build Admin CRUD/mutations and does not migrate Cart, Wishlist, Checkout, Orders, or payments. Preserve `no-watering-flower`, the original Homepage hero, mock payments, Vietnamese UI, and current visual direction.
