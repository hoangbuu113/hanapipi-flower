# Guest order recovery V1

## Authority and data flow

Guest POST `/api/v1/orders` still requires the validated mutation Origin and Idempotency-Key. The repository generates a 32-byte random token, persists only its SHA-256 hash on the unowned order and AES-GCM-encrypted replay material in idempotency_keys. The API returns canonical order JSON **without** the raw token, and sets a persistent HttpOnly cookie. Client POST/GET use same-origin credentials; Checkout never writes a new guest token to browser storage, React state or URL.

Reopen `/checkout/success/<orderCode>` in the same browser/profile: signed-out success page fetches `/api/v1/orders/<orderCode>` and browser sends the cookie. Detail includes authorized fulfilment and existing MoMo presentation. No login, phone/email lookup, account, cross-device recovery or OTP is added. Retain/bookmark the ordinary order URL (not a credential).

## Cookie and expiry

- One cookie per order: `__Secure-hf_guest_<orderCode>` on HTTPS; `hf_guest_<orderCode>` for local HTTP development.
- Path `/api/v1/orders/<orderCode>`, no Domain, HttpOnly, SameSite=Lax, Secure on HTTPS, explicit Max-Age/Expires.
- A compact 43-character token per order; independent paths avoid sending every order credential on every request. Browser cookie limits still apply: this is not an unlimited guest history/archive service.
- Lifetime is exactly 30 days from authoritative `orders.created_at_utc`. The server independently enforces expiry on guest reads. Cookie reissue/replay does not extend it. No schema migration is needed; no order rows are deleted at expiry. Existing guest orders inherit the same original-creation lifetime.
- Missing/deleted/expired access shows a safe Vietnamese message. Code alone never reveals order/payment/fulfilment data. A wrong credential or cross-order credential fails without revealing existence; valid expired capability also returns safe 404.
- Browser-cleared cookies cannot be recovered by order code alone. Persistent cookies survive ordinary browser restarts, **not** the closing of all incognito/private windows, automatic cookie-clearing policies or switching profiles/devices. Test restart in a normal browser profile while signed out; private-session lifetime is controlled by the browser, not the app.

## Replay and legacy migration

Lost-response retry with the SAME idempotency key returns the same order and reissues the same credential decrypted from existing replay material. JSON stays credential-free. Existing replay expiry remains 24 hours, separate from 30-day read access; no second token or duplicate order is created. Expired replay does not create a replacement order.

Read-only sessionStorage compatibility remains for previously issued credentials. Legacy `X-Guest-Order-Token` is accepted only for authorized order detail; a successful read sets the order-scoped cookie with remaining original lifetime. The success page removes the legacy storage entry after success. New flow never calls setItem. Invalid legacy credentials get no cookie. Remove header/read compatibility in a separate approved cleanup after rollout plus the 30-day legacy lifetime, verified migration coverage and owner QA; do not silently drop still-valid historical access now.

## Authorization and CSRF

Only GET `/api/v1/orders/:idOrCode` accepts the cookie. Canonical code URLs are the new recovery entrypoint; ID-based legacy header reads remain compatible and issue a code-scoped cookie. Cookies do not authorize lists, Admin, payment confirmation or any mutation. POST retains Origin validation and server-generated ownership/prices. No cross-origin credentials are enabled; same-origin calls are intentional.

An Authorization header always goes through Clerk verification first, even when a valid guest cookie is present. Invalid Bearer never downgrades; a signed-in user only sees their own D1 orders through the authenticated flow. Guest rows are never claimed/added to account history. Logging out leaves the independent guest cookie usable until expiry. Admin role/decryption and authenticated ownership are unaffected by guest lifetime.

## Staging release gate (no commit until owner PASS)

Automated tests must pass before staging deployment. No production deploy. No migration is required.

Owner verifies ordinary signed-out browser profile: create an unpaid labeled test order, see MoMo QR, bookmark the normal success URL, close browser, reopen same profile and URL, verify order/payment/status. Inspect URL/localStorage/sessionStorage: no new token. HttpOnly cookie is visible only in browser storage tools/network, not document.cookie. Create a second guest order and verify both URLs. Login: account history must not acquire guest orders; logout: guest URL works again. Do not transfer money. Private mode can test initial guest access, but closing all private windows intentionally destroys its cookies.

Check deletion/expired access safely denies, legacy access upgrades, and console/network do not expose credential-bearing JSON. Browser extensions/OS policies that erase cookies are outside V1 recovery guarantees. Clean isolated unpaid staging orders only through the existing approved Admin hard-delete flow after verification. Do not remove production data.
