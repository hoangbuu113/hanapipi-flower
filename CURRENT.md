# CURRENT PHASE

Phase 18 in progress: frontend Shop catalogue listing and Product Detail are migrated to the D1-backed catalogue API (`GET /api/v1/catalogue/products` and `GET /api/v1/catalogue/products/:slug`) with intentional gate fallback (`API_NOT_FOUND` → static data) and error/retry states. Homepage and SearchPage temporarily retain static `src/data/products.js` compatibility data. Admin CRUD is not implemented; commerce migration is not started. API v1 remains default closed (`API_V1_ENABLED=false`).

# LAST VERIFIED TASK

Migrated Product Detail to D1-backed catalogue detail API (`src/services/catalogueClient.js`, `src/services/apiClient.js`, `src/pages/ProductDetailPage.jsx`, `src/pages/ProductDetailPage.css`, `test/product-detail-catalogue.test.js`). Verified:
- Product Detail loads known products from `/api/v1/catalogue/products/:slug` with authoritative `priceVnd`, variants (`sizeOptions`, `wrappingOptions`), and related products from D1.
- Intentional gate condition (HTTP 404 with `API_NOT_FOUND`) triggers temporary static compatibility fallback.
- Backend genuine product-not-found (HTTP 404 with `PRODUCT_NOT_FOUND`) does NOT fallback to static; renders `.product-not-found` page.
- HTTP 500, network errors, and malformed responses surface safe error state with retry button without crashing.
- `no-watering-flower` remains priceless (`priceVnd: null`), non-purchasable, impossible to add to cart, and retains romantic gallery and "Chỉ để ngắm" CTA to `/flower-already-taken`.
- Normal purchasable products still support add-to-cart UX with variant selection and gift add-ons.
- Shop migration remains unaffected; all 12/12 shop tests and 16/16 product detail tests pass (36/36 frontend tests total).
- `API_V1_ENABLED=false` remains restored.

# CURRENT ARCHITECTURE STATE

React/Vite/Sites serves the SPA through a Cloudflare Worker. Server catalogue/pricing read authority exists in D1. Frontend Shop and Product Detail load from D1 catalogue API with transitional 404 fallback. Homepage and SearchPage still temporarily use static `src/data/products.js` compatibility data. Clerk React provider wraps the frontend. API v1 remains globally gated closed with `API_V1_ENABLED=false`. Order history is safely preserved in `localStorage` under `hanapipi-flower:orders`. Commerce (Cart, Wishlist, Checkout) remains on existing unmigrated flows.

# WHAT IS WORKING

Storefront routes and mock commerce flows exist. Catalogue invariant is 24 total / 23 purchasable / 1 priceless. Worker-based Groq concierge and local fallback exist. Clerk token verification, stable-sub D1 mapping, duplicate-safe user upsert, unauthenticated protection, frontend Clerk session, Email OTP verification, `/api/v1/me` hydration, sign-out, server-side `requireAdmin` authorization, `/api/v1/admin/me`, D1-backed catalogue listing, D1-backed product detail endpoints, and frontend Shop & Product Detail catalogue API integration with gate fallback and error/retry states are verified.

# WHAT IS PARTIAL

Homepage featured products and SearchPage have not switched to D1 catalogue API yet. Admin CRUD is not implemented. Cart, Wishlist, Checkout, and Orders have not migrated to Worker/D1; static and D1 catalogues temporarily coexist.

# CURRENT BLOCKERS

None. Frontend Product Detail catalogue migration is verified and all test suites pass. `API_V1_ENABLED` remains intentionally disabled by default.

# OPEN RISKS

- Rotation/revocation status of a Groq key previously exposed in chat is UNKNOWN.
- Public deployment may lag behind the repository; parity was not verified in this task.
- `qa/` is untracked.
- README is the generic Vite template.
- `/font-diagnostic` remains exposed.

# NEXT BEST TASK

Phase 18D: Connect Homepage featured products and SearchPage to the D1 catalogue API while preserving fallback and keeping commerce untouched.

# LATEST VERIFIED COMMIT

Use the commit resulting from this Product Detail catalogue migration checkpoint as the authoritative commit reference.

# DEPLOYMENT STATE

Sites/Worker deployment configuration exists. No deployment is performed by this task; current public parity is UNKNOWN.

# IMPORTANT NOTES

Clerk is the selected managed provider; Auth0 is not used. D1 user role is authoritative for authorization. D1 is authoritative for catalogue and pricing; frontend static data is temporary compatibility data until Phase 18 migration completes. This Phase 18 slice does not build Admin CRUD, does not switch Homepage/SearchPage, and does not migrate Cart, Wishlist, Checkout, Orders, or payments. Preserve `no-watering-flower`, the original Homepage hero, mock payments, Vietnamese UI, and current visual direction.
