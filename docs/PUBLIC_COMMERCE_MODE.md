# Reversible public commerce

Current default and staging: `PUBLIC_COMMERCE_MODE=consultation`.
Only the exact value `checkout` enables public commerce. Missing, malformed and
unknown values fail safe to consultation. The independent API v1 gate still applies.

The Worker exposes a read-only `/api/v1/public-commerce` mode for UX. A frontend
context consumes it; unavailable/invalid responses remain consultation. It cannot
authorize commerce. The Worker gates **all public `/api/v1/orders` and child reads**
before identity mapping, parsing, rate limiting, repositories or idempotency claims.
403 `COMMERCE_DISABLED` creates no order/item, credential, payment or claim.
The order detail endpoint also carries payment presentation and guest recovery;
neither is exposed publicly during consultation. No separate public payment API exists.

Cart → `/checkout` renders the current contact summary. Consultation writes only
its own tables and schedules Telegram independently. Confirmed success (including
idempotent replay) clears only the submitting identity's cart; failures preserve
it. Success and idempotent replay render the persisted D1 item snapshot/reference,
not stale client prices or the cleared cart. Contact actions are rendered only after
confirmed success; a missing QR asset is omitted rather than shown as a placeholder. Direct
legacy success URLs show a neutral notice with a real link to the summary, without
mounting the payment implementation or fetching order/guest details. Account order
rendering/loading is dormant. Admin Orders/Consultations retain their normal
Clerk/D1 authorization, historical reads, transitions and hard-delete behavior.
In consultation mode Admin fulfilment UI and its order fetch are dormant;
Consultations remains visible. Checkout mode restores the existing fulfilment UI.
Public delivery wording describes preferences, with no free-shipping/order promise.

Legacy form/summary remain in `CommerceCheckoutPage.jsx` and
`CommerceCheckoutSummary.jsx` with their original styles. They were preserved from
the pre-consultation implementation; future restoration requires no Git recovery.
CheckoutSuccess, order repositories, idempotency, guest utilities, QR assets,
payment state machines, tables, migrations and historical data are not removed.
Mode switching does not delete historical records or existing guest cookies.

## Future restore checklist (staging first)

1. Configure and validate the required payment destination/credentials and
   fulfilment encryption/auth secrets; check provider validity and real QR asset.
2. Set **server** `PUBLIC_COMMERCE_MODE=checkout` in the intended environment.
   No client flag, localStorage edit or request parameter enables the server.
3. Run current commerce/order/payment/idempotency/guest recovery regression suites
   with checkout explicitly enabled, plus consultation/security tests.
4. Verify the preserved Checkout UI is intentionally exposed, selections are
   server-authoritative and Cart clears only after confirmed creation. Inspect
   custom bouquets/availability rather than assuming every cart is orderable.
5. Deploy staging and smoke checkout/payment presentation, ownership, guest
   recovery and Admin lifecycle without sending real money unnecessarily.
6. Only then consider production via separate approved launch gates.

Flipping the mode alone is **not** production approval. Production API remains
disabled. No schema/data migration or payment-secret change is required for this gate.
