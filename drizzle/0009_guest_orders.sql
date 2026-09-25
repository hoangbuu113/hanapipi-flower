PRAGMA foreign_keys=OFF;

-- Keep the established order snapshot and payment constraints while allowing
-- exactly one owner model: a canonical user or a hashed guest access token.
CREATE TABLE orders_new (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  guest_access_token_hash TEXT CHECK (guest_access_token_hash IS NULL OR (length(guest_access_token_hash) = 64 AND guest_access_token_hash NOT GLOB '*[^0-9a-f]*')),
  order_code TEXT NOT NULL CHECK (length(order_code) BETWEEN 8 AND 40),
  status TEXT NOT NULL CHECK (status IN ('received', 'confirmed', 'preparing', 'delivering', 'out_for_delivery', 'completed', 'cancelled')),
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
  payment_method TEXT NOT NULL CHECK (payment_method IN ('momo', 'bank_transfer')),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('pending', 'paid', 'cancelled', 'mock_pending', 'mock_recorded', 'mock_cancelled')),
  created_at_utc TEXT NOT NULL CHECK (substr(created_at_utc, -1) = 'Z'),
  updated_at_utc TEXT NOT NULL CHECK (substr(updated_at_utc, -1) = 'Z'),
  CHECK ((user_id IS NULL) != (guest_access_token_hash IS NULL)),
  CHECK (
    (buyer_contact_ciphertext IS NULL AND recipient_ciphertext IS NULL
      AND delivery_address_ciphertext IS NULL AND gift_message_ciphertext IS NULL)
    OR fulfilment_key_version IS NOT NULL
  )
) STRICT;

INSERT INTO orders_new (
  id, user_id, guest_access_token_hash, order_code, status, revision,
  subtotal_vnd, total_vnd, currency, delivery_date, delivery_slot_id,
  buyer_contact_ciphertext, recipient_ciphertext, delivery_address_ciphertext,
  gift_message_ciphertext, fulfilment_key_version, fulfilment_metadata_json,
  payment_method, payment_status, created_at_utc, updated_at_utc
)
SELECT
  id, user_id, NULL, order_code, status, revision,
  subtotal_vnd, total_vnd, currency, delivery_date, delivery_slot_id,
  buyer_contact_ciphertext, recipient_ciphertext, delivery_address_ciphertext,
  gift_message_ciphertext, fulfilment_key_version, fulfilment_metadata_json,
  payment_method, payment_status, created_at_utc, updated_at_utc
FROM orders;

CREATE TABLE order_item_add_ons_backup AS SELECT * FROM order_item_add_ons;
CREATE TABLE order_items_backup AS SELECT * FROM order_items;

DROP TABLE order_item_add_ons;
DROP TABLE order_items;
DROP TABLE orders;
ALTER TABLE orders_new RENAME TO orders;

CREATE UNIQUE INDEX uq_orders_order_code ON orders(order_code);
CREATE INDEX idx_orders_user_created_at ON orders(user_id, created_at_utc DESC);
CREATE INDEX idx_orders_status_created_at ON orders(status, created_at_utc DESC);

CREATE TABLE order_items (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  product_id TEXT REFERENCES products(id) ON UPDATE RESTRICT ON DELETE SET NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('product', 'custom_bouquet')),
  product_slug_snapshot TEXT,
  product_name_snapshot TEXT NOT NULL CHECK (length(product_name_snapshot) BETWEEN 1 AND 160),
  options_snapshot_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(options_snapshot_json)),
  composition_snapshot_json TEXT NOT NULL DEFAULT '[]' CHECK (
    json_valid(composition_snapshot_json) AND json_type(composition_snapshot_json) = 'array'
  ),
  unit_price_vnd INTEGER NOT NULL CHECK (unit_price_vnd >= 0),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  line_total_vnd INTEGER NOT NULL CHECK (line_total_vnd >= 0),
  CHECK (line_total_vnd = unit_price_vnd * quantity)
) STRICT;

INSERT INTO order_items SELECT * FROM order_items_backup;
DROP TABLE order_items_backup;
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

CREATE TABLE order_item_add_ons (
  id TEXT PRIMARY KEY NOT NULL,
  order_item_id TEXT NOT NULL REFERENCES order_items(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  gift_add_on_id TEXT REFERENCES gift_add_ons(id) ON UPDATE RESTRICT ON DELETE SET NULL,
  add_on_id_snapshot TEXT NOT NULL CHECK (length(add_on_id_snapshot) BETWEEN 1 AND 80),
  add_on_name_snapshot TEXT NOT NULL CHECK (length(add_on_name_snapshot) BETWEEN 1 AND 120),
  price_vnd INTEGER NOT NULL CHECK (price_vnd >= 0)
) STRICT;

INSERT INTO order_item_add_ons SELECT * FROM order_item_add_ons_backup;
DROP TABLE order_item_add_ons_backup;
CREATE UNIQUE INDEX uq_order_item_add_ons_item_addon ON order_item_add_ons(order_item_id, add_on_id_snapshot);

INSERT INTO schema_versions (version, name, checksum, applied_at_utc)
VALUES (
  '0009_guest_orders',
  'Allow guest orders with hashed access credentials',
  'c6630bb428381082fd89552cb7ef90f9e43125846789e59e05b4d59cf7d806d3',
  '2026-09-25T00:00:00.000Z'
)
ON CONFLICT(version) DO NOTHING;

PRAGMA foreign_keys=ON;
