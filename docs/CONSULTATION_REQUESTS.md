# Consultation requests (portfolio/demo)

Public selections are **not orders**. `POST /api/v1/consultations` writes only
`consultation_requests` and `consultation_request_items` (migration 0011). No
payments, fulfilment details, user identity or contact fields are collected.
An optional existing bouquet message is bounded to 200 characters; do not put
private contact information into that message. Free text is never logged.

## Authority and replay

The client sends product IDs, size/wrapping IDs, gift IDs and quantity; custom
bouquets send option identifiers (existing cart labels are accepted only when
they match authoritative D1 options). D1 resolves active/purchasable state,
names, image references, labels and prices. Protected/priceless products are
rejected. Limits: 20 lines, quantity 1–20, 8 gifts, 2 custom flowers, 16 KiB JSON.

Each attempt carries `Idempotency-Key`. Its SHA-256 digest has a unique D1
constraint. Canonical normalized payload digest detects changed-payload replay
(409). Atomic D1 batch writes request plus all items; a concurrent loser reads
the committed request. Only the creator schedules notification. Successful
replays retain the original immutable reference values even if catalogue changes.
Public response exposes only HP reference, created time, reference total and
initial status. The reference is not an access credential; public lookup is absent.
Random HP codes contain 10 uppercase hexadecimal characters and are D1-unique.

Session storage contains only an attempt digest/key for response-loss retries,
not cart/message content. Cart remains intact. Customers quote the HP code via
existing Zalo/phone links. Prices remain references, not payment amounts.

## Notification

Server-only secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_CHAT_ID`.
Set through secure interactive input; never paste values into source/chat:

```powershell
npx wrangler secret put TELEGRAM_BOT_TOKEN --env staging
npx wrangler secret put TELEGRAM_OWNER_CHAT_ID --env staging
```

Create a bot via official BotFather, start it from the owner's Telegram account,
and obtain that private chat ID securely. Do not grant group access unnecessarily.
Do not reuse production secrets or configure production during staging tests.
Missing secrets do not break D1 persistence: notification becomes `failed`.

D1 commits first. Worker `waitUntil` extends execution while Telegram receives
plain Vietnamese text, then existing public product images (`sendPhoto` for one,
`sendMediaGroup` for 2–10). Quantity never duplicates an image; excess unique
images are mentioned in text. Text chunks stay under Telegram's 4096-character
limit; only same-origin `/api/v1/media/` or `/assets/` images are accepted.
Custom bouquet snapshots without product images currently send text only.
No new R2 objects are created. Each provider call has an 8s timeout, with a total
25s notification deadline. No raw provider errors/responses are logged/returned.

States: `pending`, `sent`, `partial` (some text delivered, later text/image fails),
`failed` (no text delivered). Delivery is best-effort, not an exactly-once provider
guarantee; there are no automatic retries after ambiguous provider responses.
If execution is interrupted or status persistence fails, Admin may see `pending`.
Do not automatically replay notification to avoid duplicates. A durable outbox
is a later reliability improvement, not V1 scope.

## Protection and Admin fallback

Independent Cloudflare limiter: 3/min/IP, HMAC keys via existing
`RATE_LIMIT_KEY_SECRET`; production/staging namespace IDs differ. Exceeded:
429 `RATE_LIMITED`, Retry-After 60. Enabled missing infrastructure: 503
`RATE_LIMIT_UNAVAILABLE`. Existing limits, CSP/noindex and API gate are unchanged.
Default production API remains disabled.

Admin list/detail/status routes under `/api/v1/admin/consultations` require
verified Clerk identity plus canonical D1 Admin role. Latest 100 consultations
are listed, with immutable selections and Telegram status. Only transitions
`new → contacted → closed` are allowed, including concurrent-update protection.
Admin mutations retain the existing Admin limiter/origin policy. Existing Admin
Orders and all order tables remain independent and unchanged.

## Staging validation

Run focused consultation/API/UI tests and required regression suites before
applying 0011 to **DB --remote --env staging**. Never migrate production here.
Deploy/smoke after the two Telegram secrets are ready: one Guest submission,
one consultation, no new orders, matching HP reference/text/images in owner's
Telegram, unchanged Cart, and Admin contacted/closed update. Zalo QR is an owner
asset requirement if `storeContact.zaloQrImage` is still empty; never substitute
the MoMo QR. No commit is authorized for this task.
