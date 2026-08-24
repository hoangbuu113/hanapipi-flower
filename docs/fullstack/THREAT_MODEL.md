# Hanapipi Flower — Threat model

Status: Phase 14 planning baseline  
Date: 2026-08-24  
Review trigger: before each Phase 15–26 exit gate and after any new API, identity provider or payment scope

## 1. Scope and assumptions

This model covers the React/Vite SPA, Cloudflare Worker, planned D1 data, managed authentication, Turnstile/rate limiting, Groq concierge, browser localStorage migration and the planned admin order view. Static bundled flower media is in scope only for integrity and privacy; R2 is not planned.

Security assumptions:

- The browser, request body, query string, localStorage, client clock and client-calculated price are hostile inputs.
- HTTPS terminates at the hosting edge. The Worker is the only application API boundary.
- Managed auth proves identity; D1 application records determine resource ownership and admin authorization.
- Payment stays mock. Card data and real payment credentials are prohibited data.
- `no-watering-flower` is an intentional public catalogue entry, but is permanently non-purchasable and excluded from purchase recommendation candidates.
- AI has no tools or ability to mutate customer, cart, order or admin state.

## 2. Assets and data classification

| Class | Examples | Handling rule |
|---|---|---|
| Public | Catalogue names, public prices, descriptions, product images, routes | Cacheable with controlled versioning; still integrity-protected |
| Internal | Feature flags, schema versions, rate-class configuration, audit event codes | Do not expose through arbitrary API fields |
| Personal | Name, email, phone, recipient, delivery address, gift message, order history | Collect minimally, encrypt sensitive fulfilment fields, owner/admin-only, no logs |
| Authentication | Session/access/refresh tokens, provider subject, recovery state | Managed provider; never log or store in Hanapipi localStorage |
| Secret | Groq key, auth secret, PII encryption keys, Turnstile secret | Worker secret store only; rotate and audit access |
| Prohibited | Passwords in D1/app storage, card number, CVV, expiry, online-banking credentials | Never collect, transmit or store |

## 3. Actors and entry points

- Legitimate anonymous customer using public catalogue, local cart/wishlist and AI.
- Authenticated customer managing their own profile, cart, wishlist, checkout and orders.
- Authorized shop administrator viewing/updating orders.
- Opportunistic attacker changing browser requests/localStorage.
- Automated bot consuming AI/API quota or attempting account/order enumeration.
- Malicious authenticated user targeting another user’s resources.
- Compromised dependency, provider session, developer device or secret.
- Upstream provider failure or malicious/invalid model response.

Entry points include `/api/v1/*`, the temporary `/api/concierge` compatibility route, auth redirects/callbacks, URL/query/path values, JSON bodies, headers/cookies, localStorage migration payloads, AI conversation text, catalogue/admin fields rendered by React and operational logs.

## 4. Risk scale

- **Critical:** plausible compromise of admin control, broadly reusable secrets or systemic customer data.
- **High:** material unauthorized purchase/state change, private-order exposure, persistent injection, outage/cost abuse or data loss.
- **Medium:** contained integrity/availability/privacy impact requiring remediation but bounded by other controls.
- Likelihood is assessed as High/Medium/Low for the planned small public storefront, before controls.

## 5. Threat register

| ID | Threat / abuse case | Severity | Likelihood | Required controls | Owning phase | Verification | Residual risk |
|---|---|---:|---:|---|---:|---|---|
| T01 | **IDOR / order-history leakage:** change order/user/cart IDs to read or mutate another customer’s data | High | High | Ignore client owner IDs; derive D1 user from verified token; query `resource.user_id = authenticated_user_id`; return 404 for non-owned records; admin path separate and audited | 17, 19–22 | Automated two-user tests for every read/write; fuzz IDs and order codes; review query predicates | Compromised valid account can still expose its own data |
| T02 | **Client price tampering:** alter `unitPrice`, subtotal, size price, add-on price or custom bouquet estimate | High | High | Request contains IDs/quantity only; Worker reloads canonical D1 prices and computes totals; immutable server order snapshot; reject stale/disabled variants with 409 | 18, 20 | Modify DevTools/localStorage/network prices and prove unchanged server total; contract tests | Admin catalogue pricing mistakes remain possible |
| T03 | **Fake product/variant/add-on IDs or commerce bypass:** inject unknown IDs or `no-watering-flower` into Cart/Checkout/recommendations | High | High | Foreign-key/canonical lookup; active/purchasable checks; allowlisted quantities; `purchase_type=priceless` invariant checked in cart, checkout, Finder and AI; reject whole invalid mutation, do not silently charge | 16, 18–20, 23 | Tests for unknown/disabled IDs and Easter egg across all entry points; seed invariant 24/23/1 | Newly introduced product states require matching policy tests |
| T04 | **SQL injection** through search, sort, filters, admin updates or IDs | High | Medium | Parameterized D1 statements only; server allowlists for columns/directions/status; bounded inputs; no raw query fragments from clients | 15–22 | Static review; malicious query corpus; verify no string-built SQL | Driver/platform defects outside app control |
| T05 | **Stored/reflected XSS** through profile, address, gift message, AI reply, catalogue/admin copy or errors | High | Medium | React text rendering; no untrusted `dangerouslySetInnerHTML`; server length/type validation; CSP; sanitize any future rich text with reviewed library; AI schema and URL allowlist | 15, 20–24 | XSS payload suite in every reflected/stored field; CSP report review | Browser extensions/compromised third-party scripts remain outside control |
| T06 | **CSRF and malicious origins** trigger state changes using an authenticated browser | High | Medium | Bearer token obtained through provider SDK; strict origin allowlist; SameSite/Secure provider cookies; reject missing/mismatched Origin on mutations; no wildcard CORS; CSRF token if any cookie-authenticated mutation remains | 15, 17–24 | Cross-origin form/fetch tests; preflight tests; inspect cookie attributes/provider setup | Same-origin XSS could bypass CSRF protections, hence CSP/XSS controls |
| T07 | **Session theft, fixation or replay** from logs, localStorage, URL, leaked cookie or stale JWT | High | Medium | Managed sessions; no app token persistence/logging; PKCE/OAuth provider flow; verify issuer/signature/exp/nbf/aud/authorized party; short lifetimes; rotation/revocation playbook; HTTPS/HSTS | 17, 24 | Expired/wrong-audience/wrong-party/replayed-token tests; logout/revocation test; log scan | A live stolen token may work until expiry/revocation |
| T08 | **Checkout double-submit/replay** creates duplicate orders | High | High | Required `Idempotency-Key`; transactional claim in D1; request hash; disable UI while pending; one active result per user/key; safe replay returns same order | 20 | Concurrent duplicate request test, retry after timeout, reused key with changed body returns conflict | User can intentionally place distinct orders using distinct keys |
| T09 | **Cart merge duplication/loss** during login, refresh or multi-tab/device merge | Medium | High | Explicit deterministic merge by canonical line key; cap quantities; server revision/ETag; idempotent merge ID; conflict feedback; preserve pre-merge local snapshot temporarily | 19, 25 | Matrix for local/server duplicates, stale revisions, multi-tab and retry | Simultaneous offline edits may require customer conflict choice |
| T10 | **Delivery cutoff bypass** by changing device clock/date/timezone or stale availability | Medium | High | Worker uses authoritative time/timezone; validates date/slot/address at checkout; Cart date is preference only; reject invalid/elapsed slot and return alternatives | 18, 20 | Boundary tests before/at/after 14:00, timezone and stale-open-tab tests | Actual fulfilment availability still requires human confirmation |
| T11 | **Admin privilege escalation** through client role, forged claims, editable metadata or direct admin API calls | Critical | Medium | D1 role is authoritative; provider token + D1 role required; no public role mutation; owner-approved bootstrap runbook; least-privilege endpoints; audit every admin mutation | 17, 22, 24 | Customer/admin matrix; forged role claims; removed-admin session test; audit review | Compromised authorized admin remains high impact |
| T12 | **AI prompt injection/data exfiltration** asks model to reveal prompt/secrets, invent products/policies or recommend the Easter egg for purchase | High | High | Treat all text/data as untrusted; fixed system rules; strict bounded JSON schema; server-known product/link allowlists; purchasable filter; no tools/private context; response validation; deterministic fallback | 23 | Red-team prompt corpus, invented-ID/URL tests, secret/PII request tests, Easter egg exclusion | Model can still produce awkward but schema-valid prose |
| T13 | **AI quota abuse/cost exhaustion** through bots, parallel requests or long prompts | High | High | Payload/history/token caps; per-IP and per-user rate classes; Turnstile for anonymous/suspicious traffic; concurrency/timeout/upstream-size caps; budget alert and kill switch; fallback | 23 | Load/rate tests, challenge failure, provider 429/timeout and kill-switch tests | Distributed low-rate abuse can cross many IPs |
| T14 | **Secret leakage** into client bundle, source, logs, screenshots, error messages or misconfigured environments | Critical | Medium | Worker secrets only; no `VITE_` secret; ignored local secret files; secret scanning; redacted logs/errors; least-privilege provider keys; rotation and incident runbook; separate staging/prod secrets | 15, 17, 23–26 | Bundle/source/log scan; deployment config review; rotation drill; provider audit | Developer/device compromise can still expose local secrets |
| T15 | **PII leakage in logs/errors/analytics/AI** including address, phone, email, gift message, order code or auth header | High | High | Data minimization; field encryption; structured allowlist logs; body/header/cookie redaction; never send customer/order data to Groq; sanitized public errors/request IDs; restricted retention/access | 15, 20–26 | Seeded canary-PII log scan; error-path tests; Groq payload inspection; access review | Authorized fulfilment staff must still see necessary delivery data |
| T16 | **User/order enumeration** via login errors, email lookup, sequential order codes, timing or response differences | Medium | High | Provider anti-enumeration behavior; opaque internal IDs; order lookups require owner auth; consistent 404/errors/timing; rate limit; do not expose existence by code | 17, 20–24 | Existing/non-existing account and order response comparison; automated enumeration test | Public product slugs remain intentionally enumerable |
| T17 | **Oversized payload/DoS** via JSON depth, item counts, search, AI or expensive D1 queries | High | High | Edge/app rate limits; content-length and actual-byte caps; depth/count/length limits; pagination maxima; indexed bounded queries; timeouts; reject unsupported content types; no unbounded regex/query | 15, 16, 19–24 | Boundary/load tests, large/chunked bodies, deep JSON, pagination abuse, D1 query plans | Large distributed attacks depend on platform controls and budget |
| T18 | **Migration failure/data loss** during schema deploy, client cutover or rollback | High | Medium | Append/expand migrations; D1 backup before change; checksums/count invariants; feature flags; dual-read shadow comparison, not unsafe dual-write; migration ledger; restore rehearsal; no destructive cleanup inside rollback window | 16, 19–21, 25–26 | Restore drill; 24/23/1 catalogue assertion; cart/wishlist/order reconciliation; rollback exercise | Extended divergence can make rollback operationally costly |
| T19 | **Stale/poisoned localStorage** overwrites newer server data or reintroduces old prices, passwords, invalid cart lines or Easter egg | Medium | High | Versioned parsers; one-way validated import; server wins for authority; never migrate passwords/prices/mock orders; explicit merge IDs; quarantine malformed data; tombstone migration state; eventual safe cleanup | 17, 19–21, 25 | Legacy/malformed payload corpus; mixed-validity cart; rollback/retry; verify other valid items survive | Users may lose intentionally corrupted or no-longer-valid local entries |

Risk count: **2 Critical, 13 High, 4 Medium**. Every Critical and High item has an implementation phase and a verification gate above.

## 6. Required abuse flows

### Commerce invariant

For every cart or order mutation the Worker performs this sequence: authenticate → establish owner → validate bounded schema → load product/variant/add-on rows → require active/purchasable state → reject `purchase_type=priceless` → compute canonical unit/line/order totals → validate delivery with Worker time → commit atomically/idempotently → return canonical snapshot. A browser-supplied monetary value is never an input to the calculation.

### Order ownership

The public order code is a display reference, not an authorization secret. Customer order queries must include the verified D1 user scope. Admin access uses a separate endpoint and D1 role check. Non-owner lookup returns the same not-found response as a missing order.

### AI containment

AI receives only bounded public catalogue facts, route context, sanitized recent conversation and static support knowledge. It receives no account, cart, checkout, address, gift-message or order data. It cannot call tools or mutations. Product/link IDs are server-validated after generation; failures fall back locally.

### Admin bootstrap

No signup can self-assign admin. The first admin mapping requires an owner-approved provider subject recorded through a controlled one-time operational procedure, followed by a second-person verification where available. Role changes are audited and revoke active access promptly.

## 7. Monitoring and response signals

- Per-route response status, latency and rate-limit outcome with request ID; no bodies.
- Count of auth failures by reason class, not token value.
- Count of ownership-denied/not-found events without exposing target IDs externally.
- Checkout idempotency conflicts and duplicate suppression.
- D1 error/latency, migration version and backup/restore status.
- AI provider status, fallback rate, schema rejection, rate-limit/challenge outcome and budget alerts.
- Admin mutations with actor user ID, action, entity ID, timestamp and before/after status only; no fulfilment PII.
- Alerts for secret scanning, sudden 401/403/429/5xx changes and catalogue invariant failure.

## 8. Explicitly accepted/deferred risks

- Anonymous carts and wishlists remain device-local until sign-in; they are not durable across devices before Phase 19 merge.
- Delivery date/time remains a preference and is not a fulfilment guarantee.
- Real payment and payment-card compliance are out of scope; any future real payment requires a new threat model and hosted/tokenized payment provider.
- AI responses are advisory. Human confirmation remains necessary for real availability and delivery.
- Exact retention periods, admin owners and production-domain allowlist require owner decisions before the relevant phase gates.
