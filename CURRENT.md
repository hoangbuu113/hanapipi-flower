# CURRENT PHASE

Phase 18 in progress: frontend Shop catalogue listing, Product Detail, SearchPage, Homepage catalogue-driven sections (`#best-sellers`), and FlowerFinderPage are migrated to the D1-backed catalogue API (`GET /api/v1/catalogue/products` and `GET /api/v1/catalogue/products/:slug`) with intentional gate fallback (`API_NOT_FOUND` → static data) and error/retry states. Static `src/data/products.js` is temporarily retained for unmigrated secondary consumers (CartItems, ConciergeWidget, CommerceContext, FlowerAlreadyTakenPage, WishlistPage, order.js, catalogueClient.js). Admin CRUD is not implemented; commerce migration is not started. API v1 remains default closed (`API_V1_ENABLED=false`).

# LAST VERIFIED TASK

Migrated FlowerFinderPage to D1-backed catalogue API (`src/pages/FlowerFinderPage.jsx`, `src/pages/FlowerFinderPage.css`, `test/flower-finder-catalogue.test.js`, `test/shop-catalogue.test.js`, `package.json`). Verified:
- FlowerFinder loads products from `/api/v1/catalogue/products` via `fetchShopCatalogue` with authoritative `priceVnd` and normalized metadata from D1.
- Existing deterministic recommendation and ranking algorithm (`rankProducts`) is preserved across representative answer sets.
- `no-watering-flower` remains non-purchasable (`purchaseType: 'priceless'`, `price: null`) and is strictly excluded from recommendations.
- Intentional gate condition (HTTP 404 with `API_NOT_FOUND`) triggers temporary static compatibility fallback.
- HTTP 500, network errors, and malformed responses surface safe error state with retry button without crashing or blanking the page chrome.
- Async UX states are distinguished: `.finder-loading` for initial load, `.finder-error-state` with retry button on error, `.finder-no-results` when no products match, and questions/results when ready.
- All 13/13 finder tests, 14/14 home tests, 12/12 search tests, 12/12 shop tests, 16/16 product detail tests, and 8/8 auth tests pass (75/75 frontend tests total).
- `API_V1_ENABLED=false` remains restored.

# CURRENT ARCHITECTURE STATE

React/Vite/Sites serves the SPA through a Cloudflare Worker. Server catalogue/pricing read authority exists in D1. Frontend Shop, Product Detail, SearchPage, Homepage, and FlowerFinderPage load from D1 catalogue API with transitional 404 fallback. Static `src/data/products.js` is temporarily retained for unmigrated secondary consumers (CartItems, ConciergeWidget, CommerceContext, FlowerAlreadyTakenPage, WishlistPage, order.js, catalogueClient.js). Clerk React provider wraps the frontend. API v1 remains globally gated closed with `API_V1_ENABLED=false`. Order history is safely preserved in `localStorage` under `hanapipi-flower:orders`. Commerce (Cart, Wishlist, Checkout) remains on existing unmigrated flows.

# WHAT IS WORKING

Storefront routes and mock commerce flows exist. Catalogue invariant is 24 total / 23 purchasable / 1 priceless. Worker-based Groq concierge and local fallback exist. Clerk token verification, stable-sub D1 mapping, duplicate-safe user upsert, unauthenticated protection, frontend Clerk session, Email OTP verification, `/api/v1/me` hydration, sign-out, server-side `requireAdmin` authorization, `/api/v1/admin/me`, D1-backed catalogue listing, D1-backed product detail endpoints, and frontend Shop, Product Detail, SearchPage, Homepage, and FlowerFinderPage catalogue API integration with gate fallback and error/retry states are verified.

# WHAT IS PARTIAL

Secondary catalogue consumers (FlowerAlreadyTakenPage, ConciergeWidget, WishlistPage, CartItems, CommerceContext) have not switched to D1 catalogue API yet. Admin CRUD is not implemented. Cart, Wishlist, Checkout, and Orders have not migrated to Worker/D1; static and D1 catalogues temporarily coexist.

# CURRENT BLOCKERS

None. Frontend FlowerFinderPage catalogue migration is verified and all test suites pass. `API_V1_ENABLED` remains intentionally disabled by default.

# OPEN RISKS

- Rotation/revocation status of a Groq key previously exposed in chat is UNKNOWN.
- Public deployment may lag behind the repository; parity was not verified in this task.
- `qa/` is untracked.
- README is the generic Vite template.
- `/font-diagnostic` remains exposed.

# NEXT BEST TASK

Phase 18G: Migrate FlowerAlreadyTakenPage or ConciergeWidget to the D1 catalogue API.

# LATEST VERIFIED COMMIT

Use the commit resulting from this FlowerFinderPage catalogue migration checkpoint as the authoritative commit reference.

# DEPLOYMENT STATE

Sites/Worker deployment configuration exists. No deployment is performed by this task; current public parity is UNKNOWN.

# IMPORTANT NOTES

Clerk is the selected managed provider; Auth0 is not used. D1 user role is authoritative for authorization. D1 is authoritative for catalogue and pricing; frontend static data is temporary compatibility data until Phase 18 migration completes. This Phase 18 slice does not build Admin CRUD and does not migrate Cart, Wishlist, Checkout, Orders, or payments. Preserve `no-watering-flower`, the original Homepage hero, mock payments, Vietnamese UI, and current visual direction.
