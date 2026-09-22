# CURRENT PHASE

Phase 18 in progress: frontend Shop catalogue listing is migrated to the D1-backed catalogue API (`GET /api/v1/catalogue/products`) with intentional gate fallback (`API_NOT_FOUND` → static data) and error/retry states. Product Detail temporarily retains static `src/data/products.js` (to be migrated in next slice). Admin CRUD is not implemented; commerce migration is not started. API v1 remains default closed (`API_V1_ENABLED=false`).

# LAST VERIFIED TASK

Migrated frontend Shop catalogue listing to D1-backed catalogue API (`src/services/catalogueClient.js`, `src/services/apiClient.js`, `src/pages/ShopPage.jsx`, `src/pages/ShopPage.css`, `test/shop-catalogue.test.js`). Verified:
- `fetchShopCatalogue` loads from `/api/v1/catalogue/products` and normalizes all 24 products from D1.
- Invariant: 24 total = 23 purchasable + 1 priceless (`no-watering-flower` with `price: null`, `purchaseType: 'priceless'`, `isPurchasable: false`).
- API price is authoritative and used for display and filtering, not static price.
- Accent-insensitive Vietnamese search and filtering/sorting operate correctly on normalized catalogue items.
- Expected intentional gate condition (HTTP 404 with `API_NOT_FOUND`) triggers temporary static fallback.
- Server errors (500), malformed responses, and network errors do NOT silently fall back; they trigger the Shop error and retry state without crashing.
- Product Detail (`ProductDetailPage.jsx`) remains static and untouched in this slice.
- `API_V1_ENABLED=false` remains restored.
- All 12/12 shop catalogue tests and 20/20 frontend tests pass.

# CURRENT ARCHITECTURE STATE

React/Vite/Sites serves the SPA through a Cloudflare Worker. Server catalogue/pricing read authority exists in D1. Frontend Shop loads from `/api/v1/catalogue/products` with transitional 404 fallback. Product Detail still temporarily uses static `src/data/products.js` compatibility data. Clerk React provider wraps the frontend. API v1 remains globally gated closed with `API_V1_ENABLED=false`. Order history is safely preserved in `localStorage` under `hanapipi-flower:orders`. Commerce (Cart, Wishlist, Checkout) remains on existing unmigrated flows.

# WHAT IS WORKING

Storefront routes and mock commerce flows exist. Catalogue invariant is 24 total / 23 purchasable / 1 priceless. Worker-based Groq concierge and local fallback exist. Clerk token verification, stable-sub D1 mapping, duplicate-safe user upsert, unauthenticated protection, frontend Clerk session, Email OTP verification, `/api/v1/me` hydration, sign-out, server-side `requireAdmin` authorization, `/api/v1/admin/me`, D1-backed catalogue listing, D1-backed product detail endpoints, and frontend Shop catalogue API integration with gate fallback and error/retry states are verified.

# WHAT IS PARTIAL

Product Detail has not switched to D1 catalogue API yet. Admin CRUD is not implemented. Cart, Wishlist, Checkout, and Orders have not migrated to Worker/D1; static and D1 catalogues temporarily coexist.

# CURRENT BLOCKERS

None. Frontend Shop catalogue migration is verified and all test suites pass. `API_V1_ENABLED` remains intentionally disabled by default.

# OPEN RISKS

- Rotation/revocation status of a Groq key previously exposed in chat is UNKNOWN.
- Public deployment may lag behind the repository; parity was not verified in this task.
- `qa/` is untracked.
- README is the generic Vite template.
- `/font-diagnostic` remains exposed.

# NEXT BEST TASK

Phase 18C: Connect frontend Product Detail (`ProductDetailPage.jsx`) to the D1 catalogue API (`GET /api/v1/catalogue/products/:slug`) while preserving fallback and keeping commerce untouched.

# LATEST VERIFIED COMMIT

Use the commit resulting from this Shop catalogue migration checkpoint as the authoritative commit reference.

# DEPLOYMENT STATE

Sites/Worker deployment configuration exists. No deployment is performed by this task; current public parity is UNKNOWN.

# IMPORTANT NOTES

Clerk is the selected managed provider; Auth0 is not used. D1 user role is authoritative for authorization. D1 is authoritative for catalogue and pricing; frontend static data is temporary compatibility data until Phase 18 migration completes. This Phase 18 slice does not build Admin CRUD, does not switch Product Detail, and does not migrate Cart, Wishlist, Checkout, Orders, or payments. Preserve `no-watering-flower`, the original Homepage hero, mock payments, Vietnamese UI, and current visual direction.
