# CURRENT PHASE

Phase 18 started: server-authoritative read-only catalogue API backed by D1 is implemented and verified. Frontend Shop/Product Detail temporarily retain static `src/data/products.js` (to be migrated in Phase 18B). Admin CRUD is not implemented; commerce migration is not started. API v1 remains default closed (`API_V1_ENABLED=false`).

# LAST VERIFIED TASK

Implemented read-only server-authoritative catalogue API backed by D1 (`src/server/repositories/catalogueRepository.js`, `src/server/api.js`, `test/catalogue-api.test.js`). Verified:
- `GET /api/v1/catalogue/products` and `GET /api/v1/catalogue` return 24 products total from D1.
- Invariant: exactly 23 purchasable + 1 priceless Easter egg (`no-watering-flower`).
- `no-watering-flower` is present, priceless (`priceVnd: null`), and non-purchasable (`isPurchasable: false`).
- Product detail lookup (`GET /api/v1/catalogue/products/:slug` and `GET /api/v1/catalogue/:slug`) returns product with variants and related products from D1. Unknown slug returns 404 `PRODUCT_NOT_FOUND`.
- Public reads require no auth; existing auth/admin endpoints remain unaffected.
- Data reads directly from D1 via `catalogueRepository`, never importing frontend `src/data/products.js`.
- `API_V1_ENABLED=false` remains restored.

# CURRENT ARCHITECTURE STATE

React/Vite/Sites serves the SPA through a Cloudflare Worker. Server catalogue/pricing read authority exists in D1. Frontend Shop and Product Detail still temporarily use static `src/data/products.js` compatibility data. Clerk React provider wraps the frontend. API v1 remains globally gated closed with `API_V1_ENABLED=false`. Order history is safely preserved in `localStorage` under `hanapipi-flower:orders`. Commerce (Cart, Wishlist, Checkout) remains on existing unmigrated flows.

# WHAT IS WORKING

Storefront routes and mock commerce flows exist. Catalogue invariant is 24 total / 23 purchasable / 1 priceless. Worker-based Groq concierge and local fallback exist. Clerk token verification, stable-sub D1 mapping, duplicate-safe user upsert, unauthenticated protection, frontend Clerk session, Email OTP verification, `/api/v1/me` hydration, sign-out, server-side `requireAdmin` authorization, `/api/v1/admin/me`, D1-backed catalogue listing, and D1-backed product detail endpoints are verified.

# WHAT IS PARTIAL

Frontend Shop/Product Detail have not switched to D1 catalogue API yet (Phase 18B). Admin CRUD is not implemented. Cart, Wishlist, Checkout, and Orders have not migrated to Worker/D1; static and D1 catalogues temporarily coexist.

# CURRENT BLOCKERS

None. Server-side catalogue API is verified and D1 invariants pass. `API_V1_ENABLED` remains intentionally disabled by default.

# OPEN RISKS

- Rotation/revocation status of a Groq key previously exposed in chat is UNKNOWN.
- Public deployment may lag behind the repository; parity was not verified in this task.
- `qa/` is untracked.
- README is the generic Vite template.
- `/font-diagnostic` remains exposed.

# NEXT BEST TASK

Phase 18B: Connect frontend Shop and Product Detail to the D1 catalogue API while preserving fallback and keeping commerce untouched.

# LATEST VERIFIED COMMIT

Use the commit resulting from this catalogue API checkpoint as the authoritative commit reference.

# DEPLOYMENT STATE

Sites/Worker deployment configuration exists. No deployment is performed by this task; current public parity is UNKNOWN.

# IMPORTANT NOTES

Clerk is the selected managed provider; Auth0 is not used. D1 user role is authoritative for authorization. D1 is authoritative for catalogue and pricing; frontend static data is temporary compatibility data until Phase 18B. This Phase 18 slice does not build Admin CRUD, does not switch frontend Shop, and does not migrate Cart, Wishlist, Checkout, Orders, or payments. Preserve `no-watering-flower`, the original Homepage hero, mock payments, Vietnamese UI, and current visual direction.
