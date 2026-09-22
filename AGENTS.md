# Hanapipi Flower engineering rules

## Workflow

- Treat the current repository, verified runtime, tests, and then documentation as the source-of-truth order.
- Before editing, inspect the implementation, consumers, data flow, focused tests, and relevant documentation.
- Complete one small, meaningful task at a time: inspect, implement, verify, report, stop.
- Any source edit after verification invalidates that verification.
- Keep investigation and reports token-efficient. Never claim DONE or PASS without current evidence.

## Git safety and verification

- Before a commit, inspect `git status`, the final diff, and run `git diff --check`.
- Run focused tests, relevant regression tests, and a production build when the task warrants them.
- A production release requires an inspected final diff and fresh appropriate tests, build, and smoke checks.
- Never use broad destructive commands such as `git restore .`, `git reset --hard`, `git clean`, or `git checkout -- .` without explicit authorization.

## Cleanup and architecture evolution

- When implementation B becomes authoritative, verify migration, move valid consumers, and safely remove superseded code.
- Do not retain obsolete architecture "just in case".
- Preserve existing product behavior and data while authority moves from static modules or `localStorage` to Worker/D1.

## Async UI reliability

- Distinguish initial loading, refresh with existing data, empty, error, and retry states.
- Preserve useful existing UI/data during background refresh.
- Auxiliary requests must not block core page data unless required.

## Requests, concurrency, and retry

- Identical concurrent GETs may use in-flight deduplication when real concurrency exists.
- Isolate caller abort signals, clean stale/aborted entries, and prevent stale responses from overwriting newer state.
- Never automatically deduplicate or replay POST, PUT, PATCH, or DELETE requests.
- Retry transient failures only with bounded attempts and backoff; respect `Retry-After` and avoid retry storms.

## Security and data integrity

- Keep secrets and provider credentials server-side; never expose tokens/secrets in source, logs, screenshots, or reports.
- The Worker derives ownership from verified identity. Never trust caller-supplied `userId`, `profileId`, ownership, or role.
- Use managed authentication only; never implement production plaintext password handling or custom password authentication.
- Internal/private APIs require explicit authentication and authorization.
- Server-authoritative commerce must recompute prices, totals, discounts, purchasability, and ownership from canonical data.
- Use idempotency and duplicate-submission protection where mutations may be replayed.

## Diagnostics and performance

- Measure individual steps before optimizing; do not optimize because something merely feels slow.
- Diagnostic scripts need hard timeouts, guaranteed termination, and per-step timing.
- Distinguish symptom mitigation, resilience improvement, and proven root cause. Do not overclaim.

## Product and visual invariants

- Creative direction: **Modern Luxury Floral Boutique × Editorial × Romantic Minimalism**.
- Experience: **đẹp → sang → cảm xúc → tin tưởng → khám phá → muốn mua**.
- Keep the visible brand `Hanapipi Flower`, natural Vietnamese UI, English code, locale `vi-VN`, and VND/`₫` formatting.
- Preserve the original Homepage hero and current editorial identity.
- Design mobile intentionally; every CTA needs a real action or destination.
- Keep motion restrained, support reduced motion, and use safe Vietnamese line-height.
- Avoid dashboard styling, neon/cyberpunk, excessive pink, black-gold cliché, generic glassmorphism, excessive gradients, excessive animation, and card-heavy UI.
