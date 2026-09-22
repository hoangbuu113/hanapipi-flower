# Architecture decisions

## 2026-08-24 / Phase 14

### DECISION

Use managed authentication only. Clerk was the preferred candidate but had not yet been approved; Auth0 remained the fallback. The Worker must verify provider identity and map the stable provider `sub` to a D1 user.

### WHY

Credential storage, password recovery, and session security should remain with a maintained identity provider. Application ownership and roles remain server-controlled in D1.

### ALTERNATIVES CONSIDERED

Auth0 as fallback; Supabase Auth was evaluated but would add a second persistent application data plane. Custom password authentication is prohibited.

### STATUS

SUPERSEDED by the Phase 17 Clerk selection below.

## 2026-08-24 / Phase 14

### DECISION

D1 is the planned authority for structured application data, introduced through phased migrations and feature gates.

### WHY

Commerce prices, ownership, totals, and order state cannot remain client-authoritative in production.

### ALTERNATIVES CONSIDERED

Keeping static modules and browser `localStorage` as permanent authority was rejected.

### STATUS

ACTIVE

## 2026-08-24 / Phase 14

### DECISION

Groq is called only from the Cloudflare Worker, with bounded validation and deterministic fallback.

### WHY

The provider secret must not reach the browser, and AI failure must not break commerce flows.

### ALTERNATIVES CONSIDERED

Direct browser-to-Groq calls were rejected.

### STATUS

ACTIVE

## 2026-08-24 / Phase 14

### DECISION

Payments remain mock-only under the current roadmap.

### WHY

Real payment processing, card data, and its compliance obligations are outside current scope.

### ALTERNATIVES CONSIDERED

Real payment integration requires a separate approved phase and threat model.

### STATUS

ACTIVE

## 2026-09-22 / Phase 17

### DECISION

Use Clerk as Hanapipi Flower's managed authentication provider. The Worker verifies Clerk identity, trusts only the verified stable `sub`, and maps that subject to the existing D1 `users` model. Do not build custom password authentication.

### WHY

Clerk supports the existing React and Cloudflare Worker architecture while keeping credential and session handling outside Hanapipi Flower. D1 remains authoritative for application user IDs, roles, status, and ownership.

### ALTERNATIVES CONSIDERED

Auth0 was retained as the fallback during planning but was not selected for the active Phase 17 implementation.

### STATUS

ACTIVE
