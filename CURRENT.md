# CURRENT PHASE

Phase 16 is complete. Phase 17 is in progress; frontend Clerk auth, authenticated `/api/v1/me`, and the server-side admin authorization foundation are verified. Admin UI is not implemented; catalogue CRUD is not implemented; commerce remains unmigrated. Phase 17 as a whole is not complete.

# LAST VERIFIED TASK

Created the server-side admin authorization foundation (`src/server/auth.js`, `src/server/api.js`, `test/auth-api.test.js`). Verified:
- Reusable `requireAuthenticatedUser` and `requireAdmin` helpers enforce authorization server-side.
- D1 user role is the sole authorization source of truth; caller-supplied `role` and `userId` cannot bypass checks.
- Minimal admin endpoint `GET /api/v1/admin/me` verified: unauthenticated → 401, customer → 403, admin → 200, inactive admin → 403.
- Live verification with real Clerk development session and local D1 proved: customer session → 403, bypass attempt → 403, controlled local D1 promotion to admin → 200 (`authorized: true`, `role: 'admin'`), restoring D1 role to customer → 403.
- `API_V1_ENABLED=false` remains restored. Admin UI and catalogue CRUD are not implemented.

# CURRENT ARCHITECTURE STATE

React/Vite/Sites serves the SPA through a Cloudflare Worker. Clerk React provider wraps the frontend with `VITE_CLERK_PUBLISHABLE_KEY`. Authenticated requests obtain Clerk session tokens and call `/api/v1/me` to hydrate D1 identity. Administrative access is guarded by `requireAdmin` checking the canonical D1 user role. API v1 remains globally gated closed with `API_V1_ENABLED=false`. Order history is safely preserved in `localStorage` under `hanapipi-flower:orders`. Commerce (Cart, Wishlist, Checkout) remains on existing unmigrated flows.

# WHAT IS WORKING

Storefront routes and mock commerce flows exist. Catalogue invariant is 24 total / 23 purchasable / 1 priceless. Worker-based Groq concierge and local fallback exist. Clerk token verification, stable-sub D1 mapping, duplicate-safe user upsert, unauthenticated protection, frontend Clerk session, Email OTP verification, `/api/v1/me` hydration, sign-out, server-side `requireAdmin` authorization, and `/api/v1/admin/me` are verified.

# WHAT IS PARTIAL

Admin UI is not implemented. Catalogue CRUD is not implemented. D1 catalogue access is not authoritative runtime commerce. Cart, Wishlist, Checkout, and Orders have not migrated to Worker/D1; static and D1 catalogues temporarily coexist.

# CURRENT BLOCKERS

No blocker remains for server-side admin authorization or frontend auth integration. `API_V1_ENABLED` remains intentionally disabled by default.

# OPEN RISKS

- Rotation/revocation status of a Groq key previously exposed in chat is UNKNOWN.
- Public deployment may lag behind the repository; parity was not verified in this task.
- `qa/` is untracked.
- README is the generic Vite template.
- `/font-diagnostic` remains exposed.

# NEXT BEST TASK

Plan next Phase 17 task (e.g. backend-authoritative cart or orders, or admin order retrieval API contract) without adding catalogue CRUD or disturbing storefront commerce stability.

# LATEST VERIFIED COMMIT

Use the commit resulting from this admin authorization checkpoint as the authoritative commit reference.

# DEPLOYMENT STATE

Sites/Worker deployment configuration exists. No deployment is performed by this task; current public parity is UNKNOWN.

# IMPORTANT NOTES

Clerk is the selected managed provider; Auth0 is not used. D1 user role is authoritative for authorization; Clerk proves identity only. Do not implement custom password auth. This Phase 17 slice does not build Admin UI, does not add catalogue CRUD, and does not migrate Cart, Wishlist, Checkout, Orders, or payments. Preserve `no-watering-flower`, the original Homepage hero, mock payments, Vietnamese UI, and current visual direction.
