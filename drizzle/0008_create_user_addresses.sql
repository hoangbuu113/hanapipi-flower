PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_addresses (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '' CHECK (length(label) <= 80),
  recipient_ciphertext TEXT NOT NULL,
  address_ciphertext TEXT NOT NULL,
  key_version TEXT NOT NULL DEFAULT 'aes-gcm-v1',
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at_utc TEXT NOT NULL CHECK (substr(created_at_utc, -1) = 'Z'),
  updated_at_utc TEXT NOT NULL CHECK (substr(updated_at_utc, -1) = 'Z'),
  deleted_at_utc TEXT CHECK (deleted_at_utc IS NULL OR substr(deleted_at_utc, -1) = 'Z')
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_addresses_default
ON user_addresses(user_id)
WHERE is_default = 1 AND deleted_at_utc IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_addresses_user_created
ON user_addresses(user_id, created_at_utc DESC)
WHERE deleted_at_utc IS NULL;

INSERT INTO schema_versions (version, name, checksum, applied_at_utc)
VALUES (
  '0008_create_user_addresses',
  'Add saved addresses table for authenticated customers',
  'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
  '2026-09-24T00:00:00.000Z'
)
ON CONFLICT(version) DO NOTHING;

