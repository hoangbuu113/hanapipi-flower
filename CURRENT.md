# CURRENT PHASE

Phase 18 in progress: frontend Shop catalogue listing, Product Detail, and SearchPage are migrated to the D1-backed catalogue API (`GET /api/v1/catalogue/products` and `GET /api/v1/catalogue/products/:slug`) with intentional gate fallback (`API_NOT_FOUND` → static data) and error/retry states. Homepage temporarily retains static `src/data/products.js` compatibility data. Admin CRUD is not implemented; commerce migration is not started. API v1 remains default closed (`API_V1_ENABLED=false`).

# LAST VERIFIED TASK

Migrated SearchPage to D1-backed catalogue API (`src/pages/SearchPage.jsx`, `src/pages/DiscoveryPages.css`, `test/search-catalogue.test.js`, `test/shop-catalogue.test.js`, `package.json`). Verified:
- SearchPage loads products from `/api/v1/catalogue/products` via `fetchShopCatalogue` with authoritative `priceVnd` and normalized metadata from D1.
- Accent-insensitive Vietnamese search (`normalizeSearch`) functions accurately across names, descriptions, collections, occasions, moods, color palettes, and flower compositions.
- Intentional gate condition (HTTP 404 with `API_NOT_FOUND`) triggers temporary static compatibility fallback.
- HTTP 500, network errors, and malformed responses surface safe error state with retry button without crashing or falling back to static data.
- `no-watering-flower` remains priceless (`priceVnd: null`), non-purchasable, and displayed as "Vô giá".
- Empty search query displays suggestions; query with no matches displays `.discovery-empty` state with link to `/shop`.
- Initial loading and error states are styled consistently in `src/pages/DiscoveryPages.css`.
- Shop and Product Detail migrations remain completely intact; all 12/12 search tests, 12/12 shop tests, 16/16 product detail tests, and 8/8 auth tests pass (48/48 frontend tests total).
- `API_V1_ENABLED=false` remains restored.

# CURRENT ARCHITECTURE STATE

React/Vite/Sites serves the SPA through a Cloudflare Worker. Server catalogue/pricing read authority exists in D1. Frontend Shop, Product Detail, and SearchPage load from D1 catalogue API with transitional 404 fallback. Homepage still temporarily uses static `src/data/products.js` compatibility data. Clerk React provider wraps the frontend. API v1 remains globally gated closed with `API_V1_ENABLED=false`. Order history is safely preserved in `localStorage` under `hanapipi-flower:orders`. Commerce (Cart, Wishlist, Checkout) remains on existing unmigrated flows.

# WHAT IS WORKING

Storefront routes and mock commerce flows exist. Catalogue invariant is 24 total / 23 purchasable / 1 priceless. Worker-based Groq concierge and local fallback exist. Clerk token verification, stable-sub D1 mapping, duplicate-safe user upsert, unauthenticated protection, frontend Clerk session, Email OTP verification, `/api/v1/me` hydration, sign-out, server-side `requireAdmin` authorization, `/api/v1/admin/me`, D1-backed catalogue listing, D1-backed product detail endpoints, and frontend Shop, Product Detail, and SearchPage catalogue API integration with gate fallback and error/retry states are verified.

# WHAT IS PARTIAL

Homepage featured products have not switched to D1 catalogue API yet. Admin CRUD is not implemented. Cart, Wishlist, Checkout, and Orders have not migrated to Worker/D1; static and D1 catalogues temporarily coexist.

# CURRENT BLOCKERS

None. Frontend SearchPage catalogue migration is verified and all test suites pass. `API_V1_ENABLED` remains intentionally disabled by default.

# OPEN RISKS

- Rotation/revocation status of a Groq key previously exposed in chat is UNKNOWN.
- Public deployment may lag behind the repository; parity was not verified in this task.
- `qa/` is untracked.
- README is the generic Vite template.
- `/font-diagnostic` remains exposed.

# NEXT BEST TASK

Phase 18E: Migrate Homepage catalogue sections (e.g. `bestSellers`) to the D1 catalogue API while preserving fallback and keeping commerce untouched.

# LATEST VERIFIED COMMIT

Use the commit resulting from this SearchPage catalogue migration checkpoint as the authoritative commit reference.

# DEPLOYMENT STATE

Sites/Worker deployment configuration exists. No deployment is performed by this task; current public parity is UNKNOWN.

# IMPORTANT NOTES

Clerk is the selected managed provider; Auth0 is not used. D1 user role is authoritative for authorization. D1 is authoritative for catalogue and pricing; frontend static data is temporary compatibility data until Phase 18 migration completes. This Phase 18 slice does not build Admin CRUD, does not switch Homepage/SearchPage, and does not migrate Cart, Wishlist, Checkout, Orders, or payments. Preserve `no-watering-flower`, the original Homepage hero, mock payments, Vietnamese UI, and current visual direction.
