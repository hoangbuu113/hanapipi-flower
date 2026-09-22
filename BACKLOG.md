# Backlog

## P0 — blocker / security / data integrity

- Confirm whether the previously exposed Groq key was revoked/rotated; status is UNKNOWN.
- Approve Clerk or choose Auth0, configure trusted domains safely, and identify admin owners before Phase 17.
- Remove the legacy plaintext local password only after successful managed-auth cutover; never migrate it.

## P1 — current MVP / fullstack work

- Phase 17: managed auth, Worker verification, and D1 user mapping only.
- Phase 18: server-authoritative catalogue, pricing, variants, and purchasability.
- Phase 19: durable owned cart/wishlist with explicit local merge.
- Phases 20–21: idempotent checkout/orders and owned account history.

## P2 — quality / performance / UX

- Replace the generic Vite README with project-specific development and migration instructions.
- Resolve untracked `qa/`, remove obsolete `routeContent`, and restrict/remove `/font-diagnostic` when appropriate.
- Add measured reliability/performance work only where evidence justifies it.

## P3 — optional polish

- Additional editorial polish or content refinements only when separately requested and without changing locked brand direction.
