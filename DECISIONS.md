# Architecture decisions

## 2026-08-24 / Phase 14

### DECISION

Use managed authentication only. Clerk is the preferred candidate but is not approved or final; Auth0 remains the fallback. The Worker must verify provider identity and map the stable provider `sub` to a D1 user.

### WHY

Credential storage, password recovery, and session security should remain with a maintained identity provider. Application ownership and roles remain server-controlled in D1.

### ALTERNATIVES CONSIDERED

Auth0 as fallback; Supabase Auth was evaluated but would add a second persistent application data plane. Custom password authentication is prohibited.

### STATUS

ACTIVE

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
