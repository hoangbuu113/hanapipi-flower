# Hanapipi Flower — Migration and rollback contract

Status: Phase 14 plan; no migration has been executed  
Scope: controlled transition from the current browser-owned mock state to managed auth + Worker `/api/v1` + D1

## 1. Migration principles

1. Preserve the current customer-facing routes and visual behavior while changing data authority behind feature flags.
2. Treat all localStorage as untrusted import material. Validate IDs and quantities, ignore prices and ownership claims, and never allow imported data to overwrite newer authoritative server data.
3. Never migrate the current plaintext demo password. Never fall back from managed auth to the local password comparison after auth cutover.
4. Never migrate legacy mock orders into authoritative D1 order history because the browser cannot prove their owner or integrity.
5. Never migrate `no-watering-flower` into Cart or orders. It may migrate into Wishlist.
6. Use expand → backfill/seed → shadow-read/reconcile → canary → cutover → observe → contract. Destructive cleanup happens only after the rollback window and explicit approval.
7. Prefer one authoritative writer at a time. Avoid client/server dual-write because partial failure creates hidden divergence.
8. Rollback disables a new read/write path; it does not erase D1 data, re-enable insecure auth or restore client-authoritative checkout.

## 2. Current local data inventory and owner

The source audit found exactly four Hanapipi application localStorage keys and no sessionStorage persistence.

| Current key/source | Current shape | Sensitive/unsafe content | Target owner | Migration rule and owning phase |
|---|---|---|---|---|
| `hanapipi-flower:cart` | Current `{items, delivery}`; parser also accepts legacy item array. Product lines include product/size/wrapping IDs, quantity, client `unitPrice`, add-on snapshots; custom bouquets include selected labels/configuration and estimated price | Client prices/add-on labels are forgeable; delivery date/slot uses device time; old data may contain the priceless product | D1 `carts`, `cart_items`, `cart_item_add_ons`; delivery moves to `delivery_drafts` for authenticated users | Phase 19 validates only IDs/config/quantity, canonicalizes and reprices. Drop invalid/non-purchasable/`no-watering-flower` lines while preserving other valid lines; return a merge report. Anonymous state remains local until sign-in |
| `hanapipi-flower:wishlist` | Array of product IDs | Stale/unknown IDs; no owner | D1 `wishlists` + `wishlist_items` for authenticated users | Phase 19 validates known visible IDs and unions with server list. `no-watering-flower` is allowed. Anonymous list remains local |
| `hanapipi-flower:account` | `{isLoggedIn, password, profile:{email,name,phone}}` or null | **Plaintext demo password**, self-asserted login and PII | Managed provider owns identity/session; D1 `users` owns minimal application profile | Phase 17 never sends/migrates `password` or `isLoggedIn`. User creates/signs into a managed account. After explicit consent, only validated profile fields may prefill/migrate. Remove the legacy password locally after successful managed-auth cutover; never copy it into a backup key |
| `hanapipi-flower:orders` | Array of client-created mock orders, cart snapshots, delivery/address/contact/gift data and client-generated order codes | Unverified ownership, client totals and substantial PII | New orders: D1 `orders` and snapshot tables; old demo orders remain browser-local only | Phase 20/21 **does not import** legacy orders. Optionally render them in a separate “Đơn demo trên thiết bị này” read-only section until the owner-approved sunset. Provide local clear control; never combine with real order results |

Other state:

- AI conversation is component memory, not localStorage. It is not migrated or persisted.
- Current catalogue/products/prices/add-ons/bouquet options are source-code seed inputs, not customer localStorage. Phase 16 seeds canonical D1 records and Phase 18 changes read/price authority.
- No independent UI-preference localStorage key currently exists. Future non-sensitive UI preferences may remain device-local.
- Managed-auth SDK storage/cookies belong to the selected provider and are not copied into Hanapipi application keys.

## 3. Proposed migration markers

Phase 19 may introduce a small, non-sensitive marker such as `hanapipi-flower:migration:v1` containing only version, per-domain completion state, timestamps and opaque merge IDs. It must not contain tokens, passwords, PII, prices or order data.

For cart/wishlist rollback safety, preserve the pre-merge anonymous payload only in its existing key until the server acknowledges the idempotent merge. After acknowledgement, retain a sanitized local cart/wishlist recovery snapshot for the defined rollback window; do not retain account/order PII copies. Cleanup requires explicit expiry and must never clear unrelated localStorage.

## 4. Deterministic merge rules

### Cart

1. Parse current object or legacy array; quarantine malformed top-level data without throwing.
2. For each line, accept only bounded IDs/configuration and positive bounded quantity. Ignore name, labels, image, `unitPrice`, add-on prices and totals.
3. Resolve every product/variant/wrapping/add-on/bouquet option against the current D1 version.
4. Drop unknown, inactive or non-purchasable lines. Explicitly drop `no-watering-flower`. Preserve all other valid lines and tell the UI which items were not imported.
5. Derive the canonical line key server-side. For the same line in local and server carts, use `max(serverQuantity, localQuantity)` rather than sum, capped by server policy; this prevents retry/login duplication.
6. Add valid local-only lines. Keep valid server-only lines.
7. If a server delivery draft exists, it wins. Otherwise import a valid local date/slot as a preference and immediately re-evaluate it using Worker time.
8. Commit merge and merge ID atomically. Only then mark the local migration complete.

### Wishlist

- Union known visible product IDs, deduplicate and cap list size. The priceless product is valid here.
- Never infer cart intent from a wishlist entry.
- Retry with the same merge ID returns the same canonical result.

### Profile

- Managed sign-in must complete first. Offer an explicit one-time consent to reuse locally stored name/phone/email as form prefill.
- Provider-verified email remains the identity email. A local email never links or changes an account by itself.
- Do not transmit the legacy password, even as a hash. Do not use it to prove identity.

### Legacy orders

- Do not upload. Do not attach to the newly authenticated user. Do not include them in admin results or operational metrics.
- Clearly distinguish local demo history from D1 orders. A legacy order code never authorizes server lookup.

## 5. Feature-flag contract

Flags are server/deployment controls. A client-visible flag may hide UI, but must never grant access or decide data authority.

| Flag | Default before its phase | Purpose | Safe rollback behavior |
|---|---:|---|---|
| `API_V1_ENABLED` | off | Expose versioned router and health/error contract | Return to existing asset/concierge behavior |
| `D1_SHADOW_READS` | off | Read D1 in background and compare without serving result | Stop shadow calls; keep D1 data |
| `CATALOGUE_FROM_D1` | off | Serve catalogue from D1 | Revert public reads to bundled catalogue only during Phase 18 rollback; checkout remains disabled unless server pricing is healthy |
| `MANAGED_AUTH_ENABLED` | off | Use managed provider and D1 user mapping | Show maintenance/anonymous browsing; **never restore local-password auth** |
| `SERVER_CART_ENABLED` | off | D1 cart for authenticated users | Preserve server cart; authenticated mutations enter read-only/retry state, anonymous local cart remains available |
| `SERVER_WISHLIST_ENABLED` | off | D1 wishlist for authenticated users | Preserve server wishlist; do not overwrite it from stale local data |
| `SERVER_DELIVERY_ENABLED` | off | D1 delivery preference and Worker cutoff | Fall back to local preference display only; revalidate later |
| `SERVER_CHECKOUT_ENABLED` | off | Server preview/order creation | Disable order placement; never fall back to client order creation |
| `SERVER_ORDERS_ENABLED` | off | D1 customer order history | Hide/maintenance real history while preserving D1; local demo history remains separately labelled |
| `ADMIN_ORDERS_ENABLED` | off | Admin order API/UI | Disable admin routes; retain data/audit |
| `AI_ABUSE_CONTROLS_ENABLED` | off until configured | Turnstile/rate classes/kill switch | Use local deterministic fallback; do not bypass limits by calling Groq directly |
| `LEGACY_DEMO_HISTORY_VISIBLE` | on until sunset decision | Keep old browser mock orders visibly separate | Can be turned off without deleting D1 or other local state |

## 6. Phase-by-phase migration and rollback

### Phase 15 — Worker API foundation

- Forward: add `/api/v1` routing, request IDs, error envelope, origin/content-size/schema middleware and security headers. Keep current `/api/concierge` behavior through the same underlying handler.
- Gate: route-contract tests and no secret/client-bundle exposure.
- Rollback: disable `API_V1_ENABLED`; no data exists to revert.

### Phase 16 — D1 foundation

- Forward: create versioned expand-only schema; seed 24 products, 23 purchasable prices, one priceless product, variants, bouquet options and gift add-ons. Record migration version and seed checksum.
- Assertions: 24 total / 23 purchasable / exactly one `no-watering-flower` priceless with null numeric price; zero invalid related IDs; four current gift add-ons; no card/password fields.
- Gate: backup/restore rehearsal, integrity queries and prepared-statement review.
- Rollback: stop D1 reads; retain database and migration ledger. Use a forward corrective migration rather than destructive down migration.

### Phase 17 — Managed authentication

- Forward: configure Clerk development/staging/production tenants and Google OAuth; verify Worker tokens; lazily create D1 user mapping; optionally import consented profile fields; purge legacy local password after confirmed sign-in.
- Gate: wrong issuer/audience/party/expiry tests, logout/revocation, two-user isolation, no local password or app-managed credential.
- Rollback: disable protected features or show maintenance. Do not reactivate local `isLoggedIn/password` checks. Provider and D1 user data remain intact.

### Phase 18 — Server catalogue and pricing

- Forward: run `D1_SHADOW_READS`, compare bundled/D1 payloads and price invariants, then canary `CATALOGUE_FROM_D1`. All commerce price calculation moves to Worker.
- Gate: exact catalogue parity; deliberate client price/ID tampering; Easter-egg exclusion.
- Rollback: public browsing may temporarily use the bundled catalogue, but checkout/order placement stays disabled unless canonical server pricing is available.

### Phase 19 — Durable cart, wishlist and delivery draft

- Forward: authenticated users receive D1 state; perform idempotent local merge once per domain; leave anonymous state local; return an itemized import report.
- Gate: malformed/legacy/mixed carts, duplicate retry, multi-tab revision, wishlist with Easter egg, cart with Easter egg plus valid items, and delivery cutoff tests.
- Rollback: stop writes and keep D1 state. Never export server state into client-authoritative prices. Re-enable only anonymous local browsing/cart behavior until service recovery.

### Phase 20 — Server checkout and orders

- Forward: require authenticated user under the secure default; preview and create through Worker; recompute everything; create immutable snapshots and idempotency record atomically; clear/convert only that server cart.
- Gate: double-submit/concurrency, stale cart, price/cutoff change, invalid IDs, no-card-field review, failure atomicity.
- Rollback: disable `SERVER_CHECKOUT_ENABLED`. Existing D1 orders remain authoritative and visible later; do not recreate them locally or reuse a failed idempotency key with different input.

### Phase 21 — Account and owned order history

- Forward: serve only `orders.user_id = authenticated_user`; keep legacy mock history separate and local; profile data uses consent/minimization.
- Gate: two-user IDOR suite and no-existence-leak responses.
- Rollback: hide D1 history behind maintenance while preserving it. Do not merge it with local mock orders.

### Phase 22 — Admin order management

- Forward: owner-approved admin bootstrap, D1 role checks and audited status transitions.
- Gate: forged/client role tests, removed-admin access, transition matrix and audit review.
- Rollback: disable admin flag; customer order creation/history may continue if unaffected.

### Phase 23 — Abuse and AI hardening

- Forward: Turnstile on anonymous AI/suspicious flows, per-IP/per-user limits, upstream budget/timeout caps and kill switch. Keep strict AI schema and fallback.
- Gate: bot/rate/provider-failure/prompt-injection test sets.
- Rollback: disable live Groq path and return local deterministic fallback; never expose the Groq key or bypass Worker.

### Phase 24 — Security hardening

- Forward: CSP/security headers, dependency/secret/log review, PII encryption/key-rotation rehearsal, deletion/retention implementation and threat-model closure.
- Gate: all Critical/High threat checks pass or have written owner acceptance.
- Rollback: revert only a breaking header/policy flag after evidence; do not roll back auth/PII protection wholesale.

### Phase 25 — Staging migration rehearsal

- Forward: production-like staging, anonymized synthetic data, full backup/restore, migration/reconciliation and rollback drill. Never copy real secrets or local customer PII into fixtures.
- Gate: signed checklist with timings, counts, error budget and named incident owner.
- Rollback: execute rehearsed flag sequence and restore test backup; document discrepancies before production approval.

### Phase 26 — Production cutover

- Forward: backup, verify current migration/schema/catalogue checksums, canary 5% → 25% → 100% with hold points; monitor auth/API/D1/order/idempotency/AI signals; preserve legacy data during rollback window.
- Gate: explicit owner authorization at every promotion, no Critical/High alert, reconciliation clean.
- Rollback: stop at current canary, disable affected flags in reverse dependency order, fail closed for checkout, keep D1 writes/orders, reconcile before retry. Do not publish an older client that resumes local password or client-created real orders.

## 7. Reconciliation checklist

| Domain | Before cutover | After/canary assertion |
|---|---|---|
| Catalogue | Bundled checksum/count | D1 = 24 total, 23 purchasable, one priceless; IDs/slugs/media refs match |
| Prices | 23 current product prices + current variant/add-on/bouquet option values | D1 integers match approved source; priceless numeric price is null |
| Cart | Local valid line count/config snapshot | Merge report accounts for imported, merged, capped and rejected lines; totals recomputed |
| Wishlist | Local known IDs | Canonical union contains all valid IDs, including Easter egg if saved |
| Delivery | Local date/slot preference | Server accepts or returns explicit stale/unavailable reason |
| Identity | Local demo account may exist | Managed provider session + unique D1 mapping; no password sent/stored |
| Orders | Local demo count, not trusted | New D1 order count only; local demos remain separate and unuploaded |
| Security | Current Worker secret boundary | Bundle/log scans clean; correct origin/token/role enforcement |

Reconciliation output contains counts and opaque IDs only. It must not copy addresses, phones, messages, passwords or tokens into logs/reports.

## 8. Rollback decision matrix

| Symptom | Immediate action | Data action | Customer behavior |
|---|---|---|---|
| Auth provider unavailable | Disable protected mutations, keep public catalogue | Preserve D1/session mappings; no local-auth fallback | Show concise maintenance and retry |
| D1 read/write degradation | Stop affected flags; fail checkout closed | Preserve database; capture non-PII request IDs | Browsing may continue from safe public cache/bundle; no client-created order |
| Price/catalogue mismatch | Disable checkout and D1 catalogue canary | Reconcile seed/version; forward-fix | Show cart refresh notice; never honor client price |
| Cart/wishlist migration bug | Stop new merges | Preserve server and sanitized pre-merge recovery state | Explain state is temporarily read-only; no silent overwrite |
| Duplicate order signal | Disable create-order flag | Retain idempotency/order rows; reconcile by key | Return existing order when verified; no second local order |
| AI abuse/provider outage | Kill live AI path | No customer data migration | Deterministic local fallback remains |
| Admin authorization anomaly | Disable admin flag and revoke affected sessions | Preserve audit data; rotate relevant secrets | Customer storefront may remain available |
| PII/secret incident | Revoke/rotate, restrict endpoint, activate incident plan | Preserve forensic metadata without expanding PII copies | Communicate per approved legal/incident process |

## 9. Retention and cleanup gates

Cleanup is prohibited until the owner approves retention periods and the rollback window has passed.

- Legacy local password: remove after successful managed-auth transition; never back up or migrate.
- Legacy mock orders: remain local/read-only until an owner-approved sunset, with an explicit clear option; never uploaded.
- Sanitized cart/wishlist recovery state: short rollback window only.
- Idempotency records: long enough to cover network/client retries, then expire by policy.
- Abandoned carts/delivery drafts, order fulfilment PII, gift messages and audit events: separate owner-approved retention schedules.
- Provider user deletion and D1 profile deletion/pseudonymization must be coordinated and tested.

## 10. Authorization and blockers

- Phase 14 authorizes documentation only. **Phase 15 is not authorized in this turn.**
- There is no identified technical blocker to begin Phase 15 after these documents are approved.
- Phase 16 additionally requires creation/approval of the D1 resource and backup ownership.
- Phase 17 is blocked until the owner approves Clerk (or chooses Auth0), configures provider/Google OAuth domains and identifies admin owners through secret-safe channels.
- Phase 20 requires acceptance of sign-in-required checkout or a separately designed guest-order access model.
- Phase 23 requires approved Turnstile/rate-limit quotas and operational budget alerts.
- Phase 25/26 require named backup, incident and production-approval owners plus explicit go/no-go approval.
