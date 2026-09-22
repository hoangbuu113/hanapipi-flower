# CURRENT PHASE

Phase 16 is complete. Phase 17 is in progress; the server-side Clerk trust boundary and live development-instance verification are complete. Phase 17 as a whole is not complete.

# LAST VERIFIED TASK

A real Clerk development session was verified end to end through the local Worker: the token was cryptographically verified, its stable `sub` mapped to one D1 user, repeated requests reused that user, and protected `GET /api/v1/me` returned the safe payload.

# CURRENT ARCHITECTURE STATE

React/Vite/Sites serves the SPA through a Cloudflare Worker. D1 schema, migrations, catalogue seed, catalogue repository, and managed-identity user repository exist. A Clerk development application is linked locally; Email OTP and Google are enabled. API v1 includes protected `GET /api/v1/me` but remains globally gated with `API_V1_ENABLED=false`. Frontend catalogue/commerce/account state is still largely static or `localStorage`-driven.

# WHAT IS WORKING

Storefront routes and mock commerce flows exist. Catalogue invariant is 24 total / 23 purchasable / 1 priceless. Worker-based Groq concierge and local fallback exist. Clerk token verification, stable-sub D1 mapping, duplicate-safe user upsert, unauthenticated protection, and one real development-session flow are verified.

# WHAT IS PARTIAL

D1 catalogue access is not authoritative runtime commerce. Clerk frontend sign-in is not integrated into the storefront. The existing frontend mock account/password flow remains unchanged. Cart, Wishlist, Checkout, Orders, and `/account/orders` have not migrated; static and D1 catalogues temporarily coexist.

# CURRENT BLOCKERS

No blocker remains for the verified server trust boundary. Frontend auth migration still requires a separately scoped implementation. API v1 remains intentionally disabled by default.

# OPEN RISKS

- Rotation/revocation status of a Groq key previously exposed in chat is UNKNOWN.
- Public deployment may lag behind the repository; parity was not verified in this bootstrap task.
- `qa/` is untracked.
- README is the generic Vite template.
- `/font-diagnostic` remains exposed.
- Mock account data stores a plaintext password in `localStorage` until managed-auth cutover.

# NEXT BEST TASK

Integrate the Clerk client provider and sign-in session into the existing frontend account entry points without migrating commerce state or removing the mock account flow until its replacement is verified.

# LATEST VERIFIED COMMIT

The current Phase 17 Clerk foundation is verified for a focused checkpoint; use current Git `HEAD` as the authoritative commit reference after that checkpoint is created.

# DEPLOYMENT STATE

Sites/Worker deployment configuration exists. No deployment is performed by this task; current public parity is UNKNOWN.

# IMPORTANT NOTES

Clerk is the selected managed provider; Auth0 is no longer the active choice. Do not implement custom password auth. This Phase 17 slice does not migrate Cart, Wishlist, Checkout, Orders, or Admin. Preserve `no-watering-flower`, the original Homepage hero, mock payments, Vietnamese UI, and current visual direction.
