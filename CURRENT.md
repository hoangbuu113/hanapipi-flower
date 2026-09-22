# CURRENT PHASE

Phase 18 in progress: frontend Shop catalogue listing, Product Detail, SearchPage, and Homepage catalogue-driven sections (`#best-sellers`) are migrated to the D1-backed catalogue API (`GET /api/v1/catalogue/products` and `GET /api/v1/catalogue/products/:slug`) with intentional gate fallback (`API_NOT_FOUND` → static data) and error/retry states. Static `src/data/products.js` is temporarily retained for unmigrated secondary consumers (CartItems, ConciergeWidget, CommerceContext, FlowerFinderPage, FlowerAlreadyTakenPage, WishlistPage, order.js, catalogueClient.js). Admin CRUD is not implemented; commerce migration is not started. API v1 remains default closed (`API_V1_ENABLED=false`).

# LAST VERIFIED TASK

Migrated Homepage catalogue sections (`#best-sellers` in `src/pages/HomePage.jsx`, `src/pages/HomePage.css`, `test/home-catalogue.test.js`, `test/shop-catalogue.test.js`, `package.json`). Verified:
- Homepage best sellers load from `/api/v1/catalogue/products` via `fetchShopCatalogue` with authoritative `priceVnd` and normalized metadata from D1.
- Original hero remains 100% untouched: copy, structure, typography, CTA behavior, media, and layout preserved.
- Core editorial content (hero, occasions, seasonal, craft, testimonials, social, newsletter) renders immediately and is never blocked by catalogue loading or errors.
- Intentional gate condition (HTTP 404 with `API_NOT_FOUND`) triggers temporary static compatibility fallback.
- HTTP 500, network errors, and malformed responses surface safe section-level error state with retry button without crashing or blanking the Homepage.
- Best sellers selection and ordering (`isBestSeller: true` -> `['nang-diu', 'du-am-hong', 'may-trang', 'vuon-som-mai']`) preserved with canonical D1 pricing.
- All 14/14 home tests, 12/12 search tests, 12/12 shop tests, 16/16 product detail tests, and 8/8 auth tests pass (62/62 frontend tests total).
- `API_V1_ENABLED=false` remains restored.

# CURRENT ARCHITECTURE STATE

React/Vite/Sites serves the SPA through a Cloudflare Worker. Server catalogue/pricing read authority exists in D1. Frontend Shop, Product Detail, SearchPage, and Homepage load from D1 catalogue API with transitional 404 fallback. Static `src/data/products.js` is temporarily retained for unmigrated secondary consumers (CartItems, ConciergeWidget, CommerceContext, FlowerFinderPage, FlowerAlreadyTakenPage, WishlistPage, order.js, catalogueClient.js). Clerk React provider wraps the frontend. API v1 remains globally gated closed with `API_V1_ENABLED=false`. Order history is safely preserved in `localStorage` under `hanapipi-flower:orders`. Commerce (Cart, Wishlist, Checkout) remains on existing unmigrated flows.

# WHAT IS WORKING

Storefront routes and mock commerce flows exist. Catalogue invariant is 24 total / 23 purchasable / 1 priceless. Worker-based Groq concierge and local fallback exist. Clerk token verification, stable-sub D1 mapping, duplicate-safe user upsert, unauthenticated protection, frontend Clerk session, Email OTP verification, `/api/v1/me` hydration, sign-out, server-side `requireAdmin` authorization, `/api/v1/admin/me`, D1-backed catalogue listing, D1-backed product detail endpoints, and frontend Shop, Product Detail, SearchPage, and Homepage catalogue API integration with gate fallback and error/retry states are verified.

# WHAT IS PARTIAL

Secondary catalogue consumers (FlowerFinderPage, FlowerAlreadyTakenPage, ConciergeWidget, WishlistPage, CartItems) have not switched to D1 catalogue API yet. Admin CRUD is not implemented. Cart, Wishlist, Checkout, and Orders have not migrated to Worker/D1; static and D1 catalogues temporarily coexist.

# CURRENT BLOCKERS

None. Frontend Homepage catalogue migration is verified and all test suites pass. `API_V1_ENABLED` remains intentionally disabled by default.

# OPEN RISKS

- Rotation/revocation status of a Groq key previously exposed in chat is UNKNOWN.
- Public deployment may lag behind the repository; parity was not verified in this task.
- `qa/` is untracked.
- README is the generic Vite template.
- `/font-diagnostic` remains exposed.

# NEXT BEST TASK

Phase 18F: Migrate remaining discovery/secondary catalogue consumers (`FlowerFinderPage`, `FlowerAlreadyTakenPage`) to the D1 catalogue API.

# LATEST VERIFIED COMMIT

Use the commit resulting from this Homepage catalogue migration checkpoint as the authoritative commit reference.

# DEPLOYMENT STATE

Sites/Worker deployment configuration exists. No deployment is performed by this task; current public parity is UNKNOWN.

# IMPORTANT NOTES

Clerk is the selected managed provider; Auth0 is not used. D1 user role is authoritative for authorization. D1 is authoritative for catalogue and pricing; frontend static data is temporary compatibility data until Phase 18 migration completes. This Phase 18 slice does not build Admin CRUD and does not migrate Cart, Wishlist, Checkout, Orders, or payments. Preserve `no-watering-flower`, the original Homepage hero, mock payments, Vietnamese UI, and current visual direction.
