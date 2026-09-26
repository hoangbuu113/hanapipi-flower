# CSP report-only baseline

This is observation only, not an enforced CSP. No report collector is added:
inspect browser console violations without persisting URLs, bodies, or user data.
Existing nosniff, frame protection, referrer/permissions policies and HTTPS HSTS
are preserved. HTML, JavaScript and CSS receive the report-only header; API JSON,
images, fonts and videos keep their existing serving behavior without a CSP.

`assets.run_worker_first=true` makes static navigation pass through the existing
Worker header wrapper too. This incurs Worker invocations for static requests;
the ASSETS binding still serves the original bytes/cache headers.

## Sources and evidence

- Clerk FAPI/script/frame origin: derived from the public Vite key used by
  `src/main.jsx`, not from request headers or a generic Clerk wildcard. Current
  staging: `https://guided-mammal-8915.clerk.accounts.dev`; current production
  build: `https://clerk.hutstudio.workers.dev`. Rebuild if the instance changes.
- `https://challenges.cloudflare.com`, `https://img.clerk.com` and
  `https://clerk-telemetry.com`: referenced by the current installed/public Clerk
  SDK. Blob workers are supported by that SDK; Admin image previews use blob URLs.
- Google Fonts stylesheet/font origins and preconnects: `index.html` and
  `src/pages/TypographyTest.css`.
- Catalogue, R2 media, videos, approved MoMo QR and Concierge: same origin.
  Groq is called only by the server and is NOT a browser connect allowance.
- Instagram is an outbound link, not a loaded resource; no CSP allowance needed.

## Inline and enforcement debt

Only `style-src` permits `unsafe-inline`: React inline style props (image focal
positions, progress, responsive styling) and Clerk runtime styles already exist.
No inline-script or eval allowance, broad scheme allowance, data image allowance,
domain wildcard, nonce plumbing or UI rewrite is introduced.

Clerk's newer documentation describes additional dynamically selected abuse
protection hosts. Do not copy its wildcard defaults blindly: the current SDK
inspection did not find those hosts. If authenticated signup/CAPTCHA produces
such violations, classify the exact resources before changing allowances.

Before future enforcement, verify login/signup/second factor/logout/Admin and
checkout success/QR with a safe authenticated session, and classify every observed
violation as legitimate, obsolete or unexpected. An unauthenticated smoke alone
does NOT establish enforcement readiness. Keep this header report-only.

References:
- https://clerk.com/docs/guides/secure/best-practices/csp-headers
- https://developers.cloudflare.com/workers/static-assets/routing/worker-script/
