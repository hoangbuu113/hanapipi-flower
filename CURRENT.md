# CURRENT PHASE

Phase 16 is complete. Phase 17 has not started.

# LAST VERIFIED TASK

D1 foundation and deterministic catalogue deployment packaging were completed in commit `64a3890`.

# CURRENT ARCHITECTURE STATE

React/Vite/Sites serves the SPA through a Cloudflare Worker. D1 schema, migrations, catalogue seed, and catalogue repository exist. Frontend catalogue/commerce/account state is still largely static or `localStorage`-driven. API v1 is gated with `API_V1_ENABLED=false`.

# WHAT IS WORKING

Storefront routes and mock commerce flows exist. Catalogue invariant is 24 total / 23 purchasable / 1 priceless. Worker-based Groq concierge and local fallback exist. D1 migration artifacts `0001` and `0002` exist.

# WHAT IS PARTIAL

D1 catalogue access is not authoritative runtime commerce. Managed auth is absent. `/account/orders` is a placeholder. Static and D1 catalogues temporarily coexist.

# CURRENT BLOCKERS

Phase 17 requires explicit provider approval and configuration. Clerk is preferred but not final; Auth0 remains the fallback.

# OPEN RISKS

- Rotation/revocation status of a Groq key previously exposed in chat is UNKNOWN.
- Public deployment may lag behind the repository; parity was not verified in this bootstrap task.
- `qa/` is untracked.
- README is the generic Vite template.
- `/font-diagnostic` remains exposed.
- Mock account data stores a plaintext password in `localStorage` until managed-auth cutover.

# NEXT BEST TASK

After explicit provider approval, perform the smallest Phase 17 task: server-side managed-token verification with focused authorization tests.

# LATEST VERIFIED COMMIT

`64a3890` — Complete D1 foundation and catalogue packaging (2026-08-25).

# DEPLOYMENT STATE

Sites/Worker deployment configuration exists. No deployment is performed by this task; current public parity is UNKNOWN.

# IMPORTANT NOTES

Do not implement custom password auth. Phase 17 must not migrate Cart, Checkout, or Orders. Preserve `no-watering-flower`, the original Homepage hero, mock payments, Vietnamese UI, and current visual direction.
