# D1 disaster recovery — Hanapipi Flower

Operational runbook; no automatic restore or production deployment. Commands verified against Wrangler 4.92.0 on 2026-09-26. Run from the project root using the installed CLI. Inspect the current config and account before every incident; names below are not permission to execute a production restore.

## Targets and recovery limits

| Environment | Explicit D1 name | Wrangler selection | Worker | R2 |
|---|---|---|---|---|
| STAGING | `hanapipi-flower-staging` | `--env staging` | `hanapipi-flower` | `hanapipi-media-staging` |
| PRODUCTION | `hanapipi-flower-prod` | default, **no staging flag** | `hanapipi-flower-prod` | `hanapipi-media-prod` |

Both use `drizzle/`; current files are `0001`–`0010_order_idempotency.sql`. Never target the ambiguous binding `DB` for recovery. Confirm the selected database ID against `wrangler.jsonc` and Cloudflare Dashboard privately.

[Cloudflare Time Travel documentation](https://developers.cloudflare.com/d1/reference/time-travel/) specifies automatic short-term recovery: 7 days on Workers Free, 30 days on Workers Paid. Verify the account plan/available history; do not assume 30 days. Bookmarks expire with retention and are not archival backups. Restore overwrites the **entire database**, cancels in-flight queries, and does not restore one row. It does not restore R2 objects, Clerk identities, Worker versions or secret bindings.

The existing `docs/fullstack/MIGRATION_AND_ROLLBACK.md` is a historical Phase 14 contract, not the current operational migration inventory. This runbook uses current config/migrations. Preserve encryption keys separately in approved secret storage: SQL ciphertext is unusable without matching `ORDER_FULFILMENT_KEY`/key-version material. Never place keys in backups or incident reports.

## A. Before a risky migration

1. Record `git rev-parse HEAD`, `git status --short`, UTC timestamp, operator and incident/change reference. Inspect each pending SQL file, schema impact and compatible app version.
2. Verify Cloudflare account with `npx wrangler whoami` and explicit target config privately; do not publish account IDs.
3. Capture pending migrations, applied ledger and current bookmark:

```powershell
# STAGING — read-only
npx wrangler d1 migrations list hanapipi-flower-staging --remote --env staging
npx wrangler d1 execute hanapipi-flower-staging --remote --env staging --command="SELECT name, applied_at FROM d1_migrations ORDER BY id;"
npx wrangler d1 time-travel info hanapipi-flower-staging --env staging --json

# PRODUCTION — READ ONLY; VERIFY DATABASE NAME
npx wrangler d1 migrations list hanapipi-flower-prod --remote
npx wrangler d1 execute hanapipi-flower-prod --remote --command="SELECT name, applied_at FROM d1_migrations ORDER BY id;"
npx wrangler d1 time-travel info hanapipi-flower-prod --json
```

4. For high-risk changes, export current state (section G), securely record the bookmark/commit/migration names and capture aggregate counts. Never record PII/tokens in Git.
5. Apply staging first, only during an approved change window:

```powershell
# STAGING ONLY — writes schema/data
npx wrangler d1 migrations apply hanapipi-flower-staging --remote --env staging
```

6. Run local regression validation and read-only remote checks (section H); smoke compatible staging app. Tests on local fixtures do not prove remote health.
7. Only then consider separately approved production migration. No production migration is authorized by this document/task. Repeat target/bookmark/export checks before approval.
8. Record before/after bookmarks, migration ledger, commit, counts, timings and validation outcome in secure operations records.

## B. Accidental Admin/data deletion

Stop further writes through an approved maintenance/traffic control mechanism, including Admin/background clients. The app has no assumed one-click maintenance feature. Establish deletion time in UTC from audit evidence and human report. Capture current bookmark and export current state before overwriting it when practical.

Prefer an existing application-level archive/restore operation when data is still present. For a hard delete, assess full-database rewind versus an explicitly reviewed selective reconstruction from secure backup; Time Travel itself cannot recover a single row. Identify all legitimate orders/updates after the recovery point and plan reconciliation, including manual payment confirmations. Do not lose recent writes silently or re-send fulfilment/payment actions.

Obtain a bookmark before the incident using `time-travel info --timestamp="<UTC-RFC3339>"`. Require explicit human confirmation of target, recovery point, downtime, data-loss window and code/schema plan before any restore.

## C. Bad migration

Never edit an already-applied migration or manually falsify `d1_migrations`. Prefer a forward corrective migration tested on staging. Time Travel is a disaster fallback when forward correction is unsafe. Restoring before a migration also rewinds the migration ledger: do not automatically reapply the faulty SQL. Align the deployed app with the restored schema **before reopening traffic**; retain secure current-state export for reconciliation.

## D. Bad deploy, correct database

Do not restore D1. Select a known-good app revision compatible with the current schema, review its security/config and roll back the Worker only under separate deployment approval. Preserve D1/R2 and secrets; never re-enable client-authoritative commerce or obsolete auth. Validate before reopening writes.

## E. Full restore — deliberate manual operation

After section B/C approval and write quiescence, replace placeholders with a verified bookmark **or** timestamp, not both. Time Travel is remote by definition; it does not accept/need `--remote`.

```powershell
# STAGING — DESTRUCTIVE, requires approved quiet window
npx wrangler d1 time-travel restore hanapipi-flower-staging --env staging --bookmark="<VERIFIED-STAGING-BOOKMARK>"
# Alternative, NOT an additional restore:
npx wrangler d1 time-travel restore hanapipi-flower-staging --env staging --timestamp="<UTC-RFC3339>"
```

**PRODUCTION — VERIFY DATABASE NAME BEFORE CONTINUING. Full overwrite; human incident approval required. Do not execute during this task.**

```powershell
npx wrangler d1 time-travel restore hanapipi-flower-prod --bookmark="<VERIFIED-PRODUCTION-BOOKMARK>"
# Alternative, NOT an additional restore:
npx wrangler d1 time-travel restore hanapipi-flower-prod --timestamp="<UTC-RFC3339>"
```

Keep the CLI confirmation prompt; do not automate confirmation. Record returned previous bookmark securely, run section H, reconcile lost-window writes, then explicitly authorize reopening traffic.

## F. Undo a mistaken restore

Keep writes stopped. Cloudflare returns a previous bookmark representing the state immediately before restore. Verify its target/history and data-loss implications; use the same environment-specific restore command in E with that **previous bookmark**, after human approval. This also rewinds the whole database and may discard writes made after the mistaken restore. If missing, inspect retained Time Travel history; do not guess. Repeat code/schema coordination and validation.

## G. Long-term SQL export

Create a dedicated restricted local folder; `backups/` and `*.d1-backup.sql` are ignored by Git. Use unique filenames (never overwrite the only backup).

```powershell
New-Item -ItemType Directory -Force -Path backups
# STAGING
npx wrangler d1 export hanapipi-flower-staging --remote --env staging --output="backups/staging-<UTC-CHANGE-ID>.d1-backup.sql"
# PRODUCTION — READ ONLY; VERIFY DATABASE NAME; backup contains sensitive data
npx wrangler d1 export hanapipi-flower-prod --remote --output="backups/production-<UTC-CHANGE-ID>.d1-backup.sql"
git check-ignore backups/production-<UTC-CHANGE-ID>.d1-backup.sql
```

Schedule exports during a quiet window: Wrangler warns the database can be unavailable during export. Capture CLI output privately because it emits a one-hour signed download URL; never paste that URL into public logs/reports. Verify nonzero bytes, schema/table presence and a SHA-256 without printing SQL/PII. Store encrypted in access-controlled external backup storage, with database/commit/migration/UTC/checksum metadata and retention owner. Git ignore is not encryption. Include R2 media backup and separate approved key escrow in the broader recovery plan. Periodically validate SQL import into an isolated recovery database; no destructive import is authorized here. Delete local plaintext exports by exact validated path when no longer needed; normal deletion is not secure erasure. Never add real data to fixtures.

## H. Restore validation

Read-only STAGING checks (for approved production verification substitute the explicit production name and **remove** `--env staging`):

```powershell
npx wrangler d1 migrations list hanapipi-flower-staging --remote --env staging
npx wrangler d1 execute hanapipi-flower-staging --remote --env staging --command="SELECT name, applied_at FROM d1_migrations ORDER BY id; PRAGMA foreign_key_check; PRAGMA quick_check;"
npx wrangler d1 execute hanapipi-flower-staging --remote --env staging --command="SELECT COUNT(*) AS products, SUM(purchase_type='standard') AS purchasable, SUM(purchase_type='priceless') AS priceless FROM products; SELECT slug, purchase_type, price_vnd FROM products WHERE slug='no-watering-flower';"
npm run test:d1
npm run test:worker
```

`test:d1` uses temporary local fixtures and current migration/seed validation, not the remote database. Compare remote state to the **captured incident baseline**, not fixture counts blindly. Original catalogue baseline is 24 / 23 standard / 1 priceless with null price; intentional Admin catalogue edits may legitimately change totals.

Before reopening confirm:

- Ledger/schema matches the intended recovery point and app version; pending migrations understood, not automatically applied. Foreign keys clean, quick_check OK.
- Aggregate row counts/sample relationships for products/variants/relations, users, orders, order_items/order_item_add_ons, audit_events, user_addresses and idempotency_keys match baseline/recovery window.
- Clerk-to-D1 mappings and Admin authorization still work; guest/user ownership protections intact.
- Historical order snapshots/totals/payment states preserved; authorized detail decrypts fulfilment with matching key version. No ciphertext, guest tokens, secrets or plaintext PII in public/list responses or logs.
- Saved addresses load correctly through authenticated UI; current-unit validation still works.
- Idempotency scope/uniqueness and persisted replay records preserved; no duplicate order or payment/fulfilment side effects after retry.
- Product media references resolve via shared resolver; R2 objects still exist (D1 restore does not undo R2 deletes/uploads). Protected personal product remains priceless/non-purchasable.
- Storefront, customer order detail, Admin catalogue/order detail and safe payment presentation healthy. Verify authorized UI without exposing personal data in evidence.

## Rehearsal record — 2026-09-26

Current staging Time Travel bookmark obtained successfully; no pending migrations reported through 0010. Full staging restore **not executed**: existing manual-test data and concurrent writes are not protected by an agreed quiet window. Do not mutate a test row and rewind the live staging DB until owner schedules a safe window. A future drill must capture pre-mutation bookmark/baseline, perform one approved uniquely identifiable reversible test mutation, verify it, restore the pre-mutation bookmark, verify disappearance, then run H. Never rehearse on production.

Staging remote SQL export succeeded; non-empty SQL and products/users/orders/order_items/user_addresses/idempotency_keys/d1_migrations schema were verified without printing contents. The temporary export was deleted after verification. Bookmarks remain operational metadata rather than permanent restore guarantees. No production restore/deploy, application behavior changes or one-command production restore helper are part of this task.
