# Order creation replay contract

`POST /api/v1/orders` requires `Idempotency-Key`, a random UUID v4. This is
not an authentication credential. The browser persists only key + payload
fingerprint in identity-scoped session storage. No fulfilment fields are stored
there. Manual retry of an unchanged checkout reuses it; changed checkout inputs
start a new attempt. There is no automatic mutation retry.

## Server authority and atomicity

- Identity is verified Clerk → canonical D1 user, or Guest only when no bearer
  was provided. Invalid bearer still fails authentication.
- Scope is `user:<D1 id>` or `guest`, never caller-supplied ownership.
- The normalized logical input includes item/options/gifts/quantities,
  buyer/recipient/address/delivery/gifting, saved-address selection and payment
  method. Object keys, item/gift order and Unicode normalization are deterministic.
  Caller prices, totals, payment status and user IDs are ignored.
- A domain-separated HMAC-SHA256 with the existing fulfilment key fingerprints
  input without storing PII or a guessable plain PII digest. The request UUID is
  stored only as SHA256.
- Migration 0010 extends the existing `idempotency_keys` table for Guest scope,
  an immutable non-PII response snapshot and encrypted Guest replay material.
- UNIQUE `(scope, action, key_hash)` plus one transactional D1 `batch()` claims
  the key and writes order/items/add-ons. No pending claim is committed separately.
  All statements roll back on failure. A losing concurrent request reads the
  winning committed record from a primary D1 session and replays or conflicts.
- Validation/transaction failure with no committed order leaves the key reusable.
  A committed order with a lost response replays its original ID/code, price,
  item snapshots and payment presentation, even after catalogue changes.

## Guest access and lifetime

Orders still store only SHA256 of a random 32-byte Guest access token. Replay
material is AES-GCM encrypted with the existing server-only fulfilment key,
bound to its order ID and purpose. No raw token or fulfilment PII is stored in
the replay record or logged. Recovering it requires the full matching normalized
request, not merely the key. Access is verified again by the order token hash.

Successful replay is available for **24 hours**. After expiry the same key
returns `409 IDEMPOTENCY_EXPIRED`, never creates another order. Its encrypted
token and response snapshot are cleared on attempted expired replay.
`409 IDEMPOTENCY_CONFLICT` means the key was used with different logical input.

Maintenance must periodically clear expired replay material on the intended
environment only (no scheduler is introduced in this task):

```sql
UPDATE idempotency_keys
SET guest_token_ciphertext = NULL, response_snapshot_json = NULL
WHERE action = 'create-order'
  AND expires_at_utc <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  AND (guest_token_ciphertext IS NOT NULL OR response_snapshot_json IS NOT NULL);
```

Keep the minimal hashed tombstone/order reference to reject delayed retries.
Deleting that tombstone would allow a previously committed request to create
another order. No plaintext PII is retained in this tombstone. Deleting an order
through the existing Admin flow does not make its old attempt key reusable.
Fulfilment-key rotation must preserve replay/decryption capability for existing
records; this task does not rotate keys.

## Checkout

Cart and attempt are cleared only after a successful authoritative response and
Guest access persistence (if needed). Ambiguous network failure, 429, conflict
or failed Guest session storage preserves the cart and attempt. A response from
a prior/unmounted identity must not clear the new identity's cart. Existing
rate limiting and server-side price resolution are unchanged.
