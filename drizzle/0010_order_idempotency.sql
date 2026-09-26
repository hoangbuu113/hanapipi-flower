-- Reuse the existing table, including historical generic user-scoped records.
-- Guest requests need nullable user_id and an explicit server-derived scope.
CREATE TABLE idempotency_keys_new (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT REFERENCES users(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope = 'guest' OR (user_id IS NOT NULL AND scope = 'user:' || user_id)),
  action TEXT NOT NULL CHECK (length(action) BETWEEN 1 AND 80),
  key_hash TEXT NOT NULL CHECK (length(key_hash) = 64),
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  response_status INTEGER CHECK (response_status IS NULL OR response_status BETWEEN 100 AND 599),
  response_body_reference TEXT CHECK (response_body_reference IS NULL OR length(response_body_reference) <= 255),
  response_snapshot_json TEXT CHECK (response_snapshot_json IS NULL OR (json_valid(response_snapshot_json) AND json_type(response_snapshot_json) = 'object')),
  guest_token_ciphertext TEXT,
  created_at_utc TEXT NOT NULL CHECK (substr(created_at_utc, -1) = 'Z'),
  expires_at_utc TEXT NOT NULL CHECK (substr(expires_at_utc, -1) = 'Z'),
  CHECK ((scope = 'guest' AND user_id IS NULL) OR (scope != 'guest' AND user_id IS NOT NULL))
) STRICT;

INSERT INTO idempotency_keys_new (
  id, user_id, scope, action, key_hash, request_hash, response_status,
  response_body_reference, created_at_utc, expires_at_utc
)
SELECT id, user_id, 'user:' || user_id, action, key_hash, request_hash,
  response_status, response_body_reference, created_at_utc, expires_at_utc
FROM idempotency_keys;

DROP TABLE idempotency_keys;
ALTER TABLE idempotency_keys_new RENAME TO idempotency_keys;
CREATE UNIQUE INDEX uq_idempotency_user_action_key ON idempotency_keys(user_id, action, key_hash);
CREATE UNIQUE INDEX uq_idempotency_scope_action_key ON idempotency_keys(scope, action, key_hash);
CREATE INDEX idx_idempotency_expiry ON idempotency_keys(expires_at_utc);

INSERT INTO schema_versions (version, name, checksum, applied_at_utc)
VALUES ('0010_order_idempotency', 'Atomic user and guest order replay',
  '2e5db36253f751976eb35dd4828625501c0a3471151f3abc51f90c65324f1a37', '2026-09-26T00:00:00.000Z')
ON CONFLICT(version) DO NOTHING;
