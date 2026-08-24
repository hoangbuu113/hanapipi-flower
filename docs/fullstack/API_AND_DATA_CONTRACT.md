# Hanapipi Flower — API and data contract

Status: Phase 14 contract; no endpoint or database is implemented by this document  
Base path for new APIs: `/api/v1`  
Content type: `application/json; charset=utf-8` unless noted

## 1. Contract rules

- The browser is not authoritative for identity, ownership, role, price, total, purchasability, delivery eligibility, order status or time.
- Money is an integer number of VND, named `*_vnd`; it is never a floating-point value. UI formatting remains `vi-VN`, such as `590.000 ₫`.
- IDs are opaque stable strings. Existing product IDs/slugs remain stable. Database-owned entity IDs use random UUID/ULID-style text and must not be sequential.
- Timestamps are ISO 8601 UTC. Delivery calendar dates use `YYYY-MM-DD` plus an allowlisted `slot_id`; the Worker applies the configured Vietnam business timezone.
- Unknown request fields are rejected for mutation endpoints. Strings, arrays, nesting, quantities, pages and body bytes are bounded.
- Authenticated routes derive the user from the verified managed-auth token. Any client `user_id`, `owner_id`, `role`, `price_vnd`, `total_vnd` or `status` outside an allowed admin transition is ignored or rejected.
- State-changing routes accept only approved origins. No wildcard CORS. Protected data responses use `Cache-Control: no-store`.
- Database queries use prepared/parameterized statements and server allowlists for sort/filter/status values.
- Payment is mock only: `cod_mock` or `bank_transfer_mock`. The API has no fields for card number, CVV, expiry, bank password, real transaction token or webhook.

### Success envelope

```json
{
  "data": {},
  "meta": {
    "requestId": "opaque-request-id"
  }
}
```

Collection responses may add `page`, `pageSize`, `nextCursor` and `catalogueVersion` under `meta`. A `204` response has no body.

### Error envelope

```json
{
  "error": {
    "code": "CART_REVISION_CONFLICT",
    "message": "Dữ liệu vừa được cập nhật. Vui lòng thử lại.",
    "fieldErrors": {
      "deliveryDate": "Ngày giao hoa không còn khả dụng."
    },
    "requestId": "opaque-request-id"
  }
}
```

Stable error codes are English uppercase identifiers; customer messages are concise Vietnamese and reveal no stack, SQL, provider payload, secret, token or resource existence. `fieldErrors` is optional.

### Status semantics

| Status | Meaning |
|---:|---|
| 200/201/204 | Successful read/create/no-content mutation |
| 400 | Malformed JSON, unsupported or unknown fields |
| 401 | Missing/invalid/expired authentication |
| 403 | Valid identity without permission, disallowed origin or failed abuse control |
| 404 | Resource absent **or not owned**; do not disclose which |
| 409 | Revision, stock/state, idempotency-body or business-rule conflict |
| 413/415/422 | Too large, wrong media type, or well-formed but invalid field values |
| 429 | Rate limit exceeded |
| 500/502/503/504 | Sanitized application/upstream/unavailable/timeout response |

## 2. Authentication, ownership and idempotency

- Protected routes require `Authorization: Bearer <managed-session-token>`. The Worker validates signature, issuer, expiry/not-before, audience and authorized party, then maps provider `sub` to D1 `users.id`.
- `owner` means `row.user_id` equals the D1 user derived from the verified token. Supplying another identifier never changes this predicate.
- `admin` means verified identity plus `users.role = 'admin'` in D1. Frontend claims and route guards are not authorization.
- Create-order and merge operations require a random `Idempotency-Key` header. The Worker stores a request hash and result for the authenticated user/action. Replaying the same key/body returns the original result; reusing a key with a different body returns `409 IDEMPOTENCY_KEY_REUSED`.
- Cart mutations use a `revision` integer or `If-Match` token. A stale writer gets `409 CART_REVISION_CONFLICT` and the latest canonical cart.

## 3. Initial rate classes

These are initial safe defaults, not billing promises; Phase 23 must tune them from observed traffic and provider quotas.

| Class | Initial policy | Extra control |
|---|---|---|
| `public-read` | 120 requests/minute/IP | CDN cache where safe |
| `user-read` | 180 requests/minute/user plus IP ceiling | Auth required |
| `user-mutation` | 60 requests/minute/user plus IP ceiling | Strict origin and revision checks |
| `checkout` | 10 previews/minute/user; 5 create attempts/10 minutes/user | Auth + idempotency; challenge on suspicious traffic |
| `ai-anonymous` | 10 requests/10 minutes/IP/device | Turnstile, payload/token caps, kill switch |
| `ai-user` | 30 requests/hour/user plus IP ceiling | Payload/token caps, provider-budget ceiling |
| `admin` | 60 requests/minute/admin plus IP ceiling | D1 role + audit event |

## 4. Endpoint contract

The compatibility route `POST /api/concierge` may temporarily call the same handler as `POST /api/v1/concierge`. It must not become a second implementation.

| Method and path | Audience / auth rule | Input | Response | Server-owned decisions | Rate / idempotency |
|---|---|---|---|---|---|
| `GET /api/v1/health` | Public; no private dependencies/details returned | None | `{status, version}` | Only coarse readiness | `public-read`; none |
| `GET /api/v1/catalogue/products` | Public | Allowlisted `q`, occasion, color, mood, collection, purchasable, budget, sort, cursor, pageSize | Bounded product summaries and catalogue version | Filter/sort semantics; priceless sorts last and is excluded from budget filters | `public-read`; cache/ETag |
| `GET /api/v1/catalogue/products/:slug` | Public | Existing slug path | Full public product, variants, media refs, related products | Active visibility and related-ID validity | `public-read`; cache/ETag |
| `GET /api/v1/me` | Authenticated user | None | Identity-safe profile and application role | Provider subject mapping and role | `user-read`; none |
| `PATCH /api/v1/me` | Authenticated owner | Optional bounded display name, phone and locale | Updated profile | Allowed fields; encryption of protected values | `user-mutation`; revision recommended |
| `DELETE /api/v1/me` | Authenticated owner with recent-auth confirmation | Explicit confirmation token/body | Accepted deletion workflow | Retention/legal deletion scope; provider deletion coordination | `user-mutation`; idempotency required |
| `GET /api/v1/cart` | Authenticated owner | None | Canonical cart, items, totals, delivery draft, revision | Ownership, current labels/prices/purchasability | `user-read`; none |
| `POST /api/v1/cart/merge` | Authenticated owner | Versioned anonymous local cart with product/config IDs and quantities; no trusted prices | Canonical merged cart + merge report | Validation, deduplication, caps, price, Easter-egg removal | `user-mutation`; idempotency required |
| `POST /api/v1/cart/items` | Authenticated owner | `productId` or custom-bouquet option IDs, variant/wrapping IDs, add-on IDs, quantity, revision | Canonical cart | ID validity, purchasability, unit price, totals, line key | `user-mutation`; revision |
| `PATCH /api/v1/cart/items/:itemId` | Authenticated owner | Quantity/config IDs and revision only | Canonical cart | Ownership, caps, current price/config | `user-mutation`; revision |
| `DELETE /api/v1/cart/items/:itemId` | Authenticated owner | Revision | Canonical cart or 204 | Ownership and new totals | `user-mutation`; revision |
| `GET /api/v1/delivery-draft` | Authenticated owner | None | Date/slot preference + revision | Ownership; availability is re-evaluated | `user-read`; none |
| `PUT /api/v1/delivery-draft` | Authenticated owner | `deliveryDate`, `slotId`, revision | Canonical preference and availability message | Worker clock, timezone, cutoff and allowlisted slot | `user-mutation`; revision |
| `GET /api/v1/wishlist` | Authenticated owner | None | Canonical product IDs/summaries + revision | Ownership; may include `no-watering-flower` | `user-read`; none |
| `POST /api/v1/wishlist/merge` | Authenticated owner | Versioned local product-ID array | Canonical union + merge report | Known visible IDs, deduplication and caps | `user-mutation`; idempotency required |
| `PUT /api/v1/wishlist/items/:productId` | Authenticated owner | Revision optional | Canonical wishlist | Product exists/visible; Easter egg allowed | `user-mutation`; revision |
| `DELETE /api/v1/wishlist/items/:productId` | Authenticated owner | Revision optional | Canonical wishlist or 204 | Ownership | `user-mutation`; revision |
| `POST /api/v1/checkout/preview` | Authenticated owner | Cart revision, recipient/contact/address, delivery preference, gift message/sender, mock payment method | Validated canonical summary, warnings and short-lived preview token/version | Current prices, all IDs, cutoff, total, PII validation; no order yet | `checkout`; no persisted idempotency required |
| `POST /api/v1/orders` | Authenticated owner | Cart revision, preview token/version, bounded fulfilment fields, mock payment method | `201` immutable order summary | Revalidation, total, delivery, ownership, order code, snapshots; atomically converts/clears cart | `checkout`; **Idempotency-Key required** |
| `GET /api/v1/orders` | Authenticated owner | Cursor, bounded pageSize | Only owner’s order summaries | Ownership predicate and pagination | `user-read`; none |
| `GET /api/v1/orders/:orderId` | Authenticated owner | Opaque order ID | Only owner’s order detail | Ownership; non-owner returns 404 | `user-read`; none |
| `POST /api/v1/concierge` | Public or authenticated; anonymous requires valid Turnstile | Current bounded message/history/page context; product requests are resolved against server catalogue | Strict response type/message/quick replies/product IDs/link IDs/note | PII redaction, candidates, allowed links, purchasability, provider timeout/fallback | `ai-anonymous` or `ai-user`; no action idempotency |
| `GET /api/v1/admin/orders` | Authenticated **admin** | Status/date cursor filters, bounded pageSize | Redacted order list; fulfilment fields only when operationally necessary | D1 role, allowed filters, audit read if sensitive | `admin`; none |
| `GET /api/v1/admin/orders/:orderId` | Authenticated **admin** | Opaque order ID | Fulfilment detail | D1 role; decrypt only needed PII; audit access | `admin`; none |
| `PATCH /api/v1/admin/orders/:orderId/status` | Authenticated **admin** | Allowlisted next status, expected revision, short note | Updated order status | Valid transition, role, concurrency, audit event | `admin`; idempotency recommended |

There are no application endpoints for password registration, password login, reset-password storage or credential verification. Those flows belong to the managed provider. There is no real payment endpoint.

## 5. Catalogue and order invariants

1. Catalogue seed and runtime health checks assert exactly **24 products**, of which **23 are purchasable** and exactly one has `id = slug = no-watering-flower`, `purchase_type = priceless`, and `price_vnd = null`.
2. The priceless entry is returned by unbudgeted catalogue/search and may be stored in Wishlist. It sorts after priced items when sorting by price.
3. It is rejected from Cart, custom bouquet, checkout, order snapshots, budget filters, Flower Finder recommendations and AI purchase candidates regardless of client input.
4. A money formatter is called only with validated integer VND. The API sends `priceLabel: "Vô giá"` or equivalent presentation data separately for the priceless entry; it never sends the string as a numeric field.
5. Order items are immutable server snapshots. Later catalogue edits do not rewrite historical names, options or prices.
6. Existing legacy mock orders may render locally as explicitly labelled demo history, but are never inserted into authoritative orders without a separate verified migration decision.

## 6. D1 logical data model

This is a logical contract, **not SQL**. Phase 16 defines migrations only after review. All timestamps are UTC; all foreign-key behavior must be explicit. User-owned rows never accept an owner supplied by the browser.

| Table | Primary key / ownership | Important fields | Uniqueness, indexes and query patterns | Must not store |
|---|---|---|---|---|
| `users` | `id`; mapped from managed identity | `auth_provider`, `provider_subject`, `role`, `display_name`, encrypted phone/profile fields, `locale`, status, created/updated/deleted timestamps | Unique `(auth_provider, provider_subject)`; index role/status; query by verified subject and admin role | Password/hash, provider secret, session/refresh token, card data |
| `products` | Existing stable product `id` | `slug`, name, descriptions, collection, `purchase_type`, nullable `price_vnd`, currency, status, badge, colors/moods/occasions/composition/care/delivery/media references, sort/created timestamps | Unique slug; indexes status/collection/purchase type/price; search uses bounded normalized fields | Personal identity claims, binary media, client-computed price |
| `product_variants` | Opaque `id`; FK `product_id` | option type/code/label, `price_delta_vnd`, active, sort order, version | Unique `(product_id, option_type, code)`; index product/active | Unvalidated arbitrary configuration or presentation HTML |
| `bouquet_options` | Stable option `id` | type (style/palette/size/flower/wrapping), label, `price_delta_vnd`, min/max rules, active, sort/version | Unique `(type, id)`; index type/active; used to validate builder configuration | Customer message, client price |
| `gift_add_ons` | Stable add-on `id` | name, short description, `price_vnd`, active, sort/version | Unique ID; index active; lookup by submitted IDs | Cart/order owner or client price snapshot as authority |
| `carts` | Opaque `id`; FK `user_id` owner | state, revision, created/updated/converted timestamps | One active cart per user by application/constraint; index `(user_id, state)` and updated time | Delivery PII, auth token, totals as sole authority |
| `cart_items` | Opaque `id`; FK `cart_id`; indirect owner | item type, nullable product/variant/wrapping IDs, validated bouquet configuration, quantity, canonical `unit_price_vnd`, configuration version, created/updated | Unique canonical line key per cart; indexes cart/product; bounded quantities | Raw localStorage object, arbitrary labels/prices, priceless product |
| `cart_item_add_ons` | Opaque `id`; FK cart item/add-on | canonical `price_vnd` at cart calculation version | Unique `(cart_item_id, gift_add_on_id)`; index cart item | Client-supplied add-on name/price |
| `wishlists` | Opaque `id`; FK `user_id` owner | revision, created/updated | Unique user; query by owner | Price or private profile data |
| `wishlist_items` | Opaque `id`; FK wishlist/product | created timestamp | Unique `(wishlist_id, product_id)`; indexes wishlist and product; priceless product allowed | Cart/checkout state |
| `delivery_drafts` | Opaque `id`; unique FK `user_id` owner | date, slot ID, timezone/business-rule version, revision, updated timestamp | Unique user; query by owner | Claim of guaranteed delivery, full address unless explicitly needed later |
| `orders` | Opaque `id`; FK `user_id` owner | unique display `order_code`, status/revision, subtotal/total VND, currency, delivery date/slot, encrypted contact/recipient/address/gift fields and key version, mock payment method/status, created/updated | Unique order code; indexes `(user_id, created_at)`, status/date for admin | Card/payment credentials, plaintext fulfilment PII in logs/audit, client total |
| `order_items` | Opaque `id`; FK order; optional FK product for reference | immutable item type/id/slug/name/options/composition snapshot, `unit_price_vnd`, quantity, `line_total_vnd` | Index order/product; snapshots remain if product changes | Priceless product, mutable references as the only historical record |
| `order_item_add_ons` | Opaque `id`; FK order item; optional add-on reference | immutable ID/name/price snapshot | Index order item | Client-supplied snapshot without canonical validation |
| `idempotency_keys` | Opaque `id`; FK `user_id` | action, key hash, request hash, response status/body reference, created/expiry | Unique `(user_id, action, key_hash)`; index expiry for cleanup | Raw auth token, full PII request body, raw key if a keyed hash suffices |
| `audit_events` | Opaque `id`; optional actor FK | action, entity type/ID, result, request ID, timestamp, minimal status diff, metadata version | Index timestamp, actor, entity/action; append-only | Auth header/cookie, request/response body, address/phone/email/gift message, secret |

### Relationship and deletion rules

- Managed identity deletion is coordinated with D1 user status. Orders required for legitimate retention are detached only through an approved pseudonymization policy, never silently reassigned.
- Cart, wishlist and delivery draft belong to exactly one user and cascade/archive according to the deletion workflow.
- Order snapshots are immutable; status changes append audit events and use revision checks.
- Catalogue products should be disabled/archived instead of hard-deleted when referenced historically.
- Idempotency and audit retention are finite and independently configurable.

## 7. Validation and concurrency contract

- IDs: allowlisted ASCII identifiers where existing IDs are public; opaque entity IDs must match the generated format and maximum length.
- Quantity: positive bounded integer; initial maximum is 20 per line and 50 total units/cart unless product rules lower it.
- Cart lines/add-ons: bounded count; the server derives a canonical line key and merges duplicates.
- Text: Unicode strings normalized for comparison where appropriate, preserved for display, and bounded before encryption/storage. HTML is not accepted.
- Pagination: cursor-based with maximum page size 50; no unbounded list APIs.
- Revisions: mutations include expected revision; successful mutation increments it. Conflicts return the latest safe representation.
- Checkout: preview is advisory and short-lived. Order creation repeats all validation and price/time calculation inside the transaction boundary.
- Search/sort: mapped from public enum values to fixed server expressions; no arbitrary field names or SQL fragments.

## 8. Logging and privacy contract

Allowed structured fields: request ID, route template, method, status, duration, rate class/outcome, authenticated internal user ID when necessary, entity ID, error code, provider status class, schema/migration version. IP may be used transiently or irreversibly keyed-hashed for abuse controls, not retained raw by application logs unless a reviewed incident policy requires it.

Disallowed fields: authorization/cookie headers, tokens, secrets, request/response bodies, AI messages/history, email, phone, recipient, address, gift message, card/bank data, decrypted D1 PII and raw Turnstile/provider payloads.
