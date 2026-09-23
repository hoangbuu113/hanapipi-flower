PRAGMA foreign_keys=OFF;

CREATE TABLE orders_new (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  order_code TEXT NOT NULL CHECK (length(order_code) BETWEEN 8 AND 40),
  status TEXT NOT NULL CHECK (status IN ('received', 'confirmed', 'preparing', 'out_for_delivery', 'completed', 'cancelled')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  subtotal_vnd INTEGER NOT NULL CHECK (subtotal_vnd >= 0),
  total_vnd INTEGER NOT NULL CHECK (total_vnd >= subtotal_vnd),
  currency TEXT NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
  delivery_date TEXT NOT NULL CHECK (length(delivery_date) = 10),
  delivery_slot_id TEXT NOT NULL CHECK (length(delivery_slot_id) BETWEEN 1 AND 80),
  buyer_contact_ciphertext TEXT,
  recipient_ciphertext TEXT,
  delivery_address_ciphertext TEXT,
  gift_message_ciphertext TEXT,
  fulfilment_key_version TEXT,
  fulfilment_metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (
    json_valid(fulfilment_metadata_json) AND json_type(fulfilment_metadata_json) = 'object'
  ),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('bank_transfer', 'bank_transfer_mock', 'cod_mock', 'cod')),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('pending', 'paid', 'cancelled', 'mock_pending', 'mock_recorded', 'mock_cancelled')),
  created_at_utc TEXT NOT NULL CHECK (substr(created_at_utc, -1) = 'Z'),
  updated_at_utc TEXT NOT NULL CHECK (substr(updated_at_utc, -1) = 'Z'),
  CHECK (
    (buyer_contact_ciphertext IS NULL AND recipient_ciphertext IS NULL
      AND delivery_address_ciphertext IS NULL AND gift_message_ciphertext IS NULL)
    OR fulfilment_key_version IS NOT NULL
  )
) STRICT;

INSERT INTO orders_new SELECT * FROM orders;

DROP TABLE orders;

ALTER TABLE orders_new RENAME TO orders;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_order_code
ON orders(order_code);

CREATE INDEX IF NOT EXISTS idx_orders_user_created_at
ON orders(user_id, created_at_utc DESC);

CREATE INDEX IF NOT EXISTS idx_orders_status_created_at
ON orders(status, created_at_utc DESC);

INSERT INTO schema_versions (version, name, checksum, applied_at_utc)
VALUES (
  '0004_update_order_payment_constraints',
  'Update order payment_method and payment_status constraints for real bank transfer',
  'd4a6e8b1c2f309485761a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3',
  '2026-09-23T00:00:00.000Z'
)
ON CONFLICT(version) DO NOTHING;

PRAGMA foreign_keys=ON;
