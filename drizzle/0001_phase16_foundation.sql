PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_versions (
  version TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL CHECK (length(checksum) = 64),
  applied_at_utc TEXT NOT NULL CHECK (substr(applied_at_utc, -1) = 'Z')
) STRICT;

CREATE TABLE IF NOT EXISTS catalogue_versions (
  version TEXT PRIMARY KEY NOT NULL,
  checksum TEXT NOT NULL UNIQUE CHECK (length(checksum) = 64),
  product_count INTEGER NOT NULL CHECK (product_count >= 0),
  purchasable_count INTEGER NOT NULL CHECK (purchasable_count >= 0),
  gift_add_on_count INTEGER NOT NULL CHECK (gift_add_on_count >= 0),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  seeded_at_utc TEXT NOT NULL CHECK (substr(seeded_at_utc, -1) = 'Z')
) STRICT;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  auth_provider TEXT NOT NULL CHECK (length(auth_provider) BETWEEN 1 AND 40),
  provider_subject TEXT NOT NULL CHECK (length(provider_subject) BETWEEN 1 AND 255),
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  display_name TEXT CHECK (display_name IS NULL OR length(display_name) <= 120),
  phone_ciphertext TEXT,
  phone_key_version TEXT,
  locale TEXT NOT NULL DEFAULT 'vi-VN' CHECK (length(locale) BETWEEN 2 AND 16),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'deleted')),
  created_at_utc TEXT NOT NULL CHECK (substr(created_at_utc, -1) = 'Z'),
  updated_at_utc TEXT NOT NULL CHECK (substr(updated_at_utc, -1) = 'Z'),
  deleted_at_utc TEXT CHECK (deleted_at_utc IS NULL OR substr(deleted_at_utc, -1) = 'Z'),
  CHECK (
    (phone_ciphertext IS NULL AND phone_key_version IS NULL)
    OR (phone_ciphertext IS NOT NULL AND phone_key_version IS NOT NULL)
  )
) STRICT;

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL CHECK (length(slug) BETWEEN 1 AND 100),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  short_description TEXT NOT NULL CHECK (length(short_description) <= 320),
  description TEXT NOT NULL CHECK (length(description) <= 1200),
  collection TEXT NOT NULL CHECK (length(collection) <= 160),
  purchase_type TEXT NOT NULL CHECK (purchase_type IN ('standard', 'priceless')),
  price_vnd INTEGER,
  currency TEXT NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
  status TEXT NOT NULL CHECK (status IN ('available', 'seasonal', 'preorder', 'archived')),
  badges_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(badges_json) AND json_type(badges_json) = 'array'),
  colors_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(colors_json) AND json_type(colors_json) = 'array'),
  moods_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(moods_json) AND json_type(moods_json) = 'array'),
  occasions_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(occasions_json) AND json_type(occasions_json) = 'array'),
  composition_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(composition_json) AND json_type(composition_json) = 'array'),
  media_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(media_json) AND json_type(media_json) = 'array'),
  care_note TEXT NOT NULL CHECK (length(care_note) <= 800),
  delivery_note TEXT NOT NULL CHECK (length(delivery_note) <= 800),
  is_best_seller INTEGER NOT NULL DEFAULT 0 CHECK (is_best_seller IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  catalogue_version_id TEXT NOT NULL REFERENCES catalogue_versions(version) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at_utc TEXT NOT NULL CHECK (substr(created_at_utc, -1) = 'Z'),
  updated_at_utc TEXT NOT NULL CHECK (substr(updated_at_utc, -1) = 'Z'),
  CHECK (
    (purchase_type = 'standard' AND typeof(price_vnd) = 'integer' AND price_vnd >= 0)
    OR (purchase_type = 'priceless' AND price_vnd IS NULL)
  )
) STRICT;

CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  option_type TEXT NOT NULL CHECK (option_type IN ('size', 'wrapping')),
  code TEXT NOT NULL CHECK (length(code) BETWEEN 1 AND 80),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
  note TEXT CHECK (note IS NULL OR length(note) <= 320),
  price_vnd INTEGER CHECK (price_vnd IS NULL OR price_vnd >= 0),
  price_delta_vnd INTEGER NOT NULL DEFAULT 0 CHECK (price_delta_vnd >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  catalogue_version_id TEXT NOT NULL REFERENCES catalogue_versions(version) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CHECK (
    (option_type = 'size' AND typeof(price_vnd) = 'integer')
    OR (option_type = 'wrapping' AND price_vnd IS NULL)
  )
) STRICT;

CREATE TABLE IF NOT EXISTS product_relations (
  product_id TEXT NOT NULL REFERENCES products(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  related_product_id TEXT NOT NULL REFERENCES products(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  PRIMARY KEY (product_id, related_product_id),
  CHECK (product_id <> related_product_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS bouquet_options (
  id TEXT PRIMARY KEY NOT NULL,
  option_type TEXT NOT NULL CHECK (option_type IN ('style', 'palette', 'size', 'flower', 'wrapping')),
  option_code TEXT NOT NULL CHECK (length(option_code) BETWEEN 1 AND 80),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
  description TEXT CHECK (description IS NULL OR length(description) <= 500),
  note TEXT CHECK (note IS NULL OR length(note) <= 320),
  colors_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(colors_json) AND json_type(colors_json) = 'array'),
  base_price_vnd INTEGER CHECK (base_price_vnd IS NULL OR base_price_vnd >= 0),
  price_delta_vnd INTEGER NOT NULL DEFAULT 0 CHECK (price_delta_vnd >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  catalogue_version_id TEXT NOT NULL REFERENCES catalogue_versions(version) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CHECK (
    (option_type = 'size' AND typeof(base_price_vnd) = 'integer')
    OR (option_type <> 'size' AND base_price_vnd IS NULL)
  )
) STRICT;

CREATE TABLE IF NOT EXISTS gift_add_ons (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  short_description TEXT NOT NULL CHECK (length(short_description) <= 320),
  price_vnd INTEGER NOT NULL CHECK (price_vnd >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  catalogue_version_id TEXT NOT NULL REFERENCES catalogue_versions(version) ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;

CREATE TABLE IF NOT EXISTS carts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'converted', 'abandoned')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at_utc TEXT NOT NULL CHECK (substr(created_at_utc, -1) = 'Z'),
  updated_at_utc TEXT NOT NULL CHECK (substr(updated_at_utc, -1) = 'Z'),
  converted_at_utc TEXT CHECK (converted_at_utc IS NULL OR substr(converted_at_utc, -1) = 'Z')
) STRICT;

CREATE TABLE IF NOT EXISTS cart_items (
  id TEXT PRIMARY KEY NOT NULL,
  cart_id TEXT NOT NULL REFERENCES carts(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('product', 'custom_bouquet')),
  product_id TEXT REFERENCES products(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  size_variant_id TEXT REFERENCES product_variants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  wrapping_variant_id TEXT REFERENCES product_variants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  bouquet_configuration_json TEXT CHECK (
    bouquet_configuration_json IS NULL
    OR (json_valid(bouquet_configuration_json) AND json_type(bouquet_configuration_json) = 'object')
  ),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  unit_price_vnd INTEGER NOT NULL CHECK (unit_price_vnd >= 0),
  line_key TEXT NOT NULL CHECK (length(line_key) BETWEEN 1 AND 255),
  catalogue_version_id TEXT NOT NULL REFERENCES catalogue_versions(version) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at_utc TEXT NOT NULL CHECK (substr(created_at_utc, -1) = 'Z'),
  updated_at_utc TEXT NOT NULL CHECK (substr(updated_at_utc, -1) = 'Z'),
  CHECK (
    (item_type = 'product' AND product_id IS NOT NULL AND bouquet_configuration_json IS NULL)
    OR (item_type = 'custom_bouquet' AND product_id IS NULL AND bouquet_configuration_json IS NOT NULL)
  )
) STRICT;

CREATE TABLE IF NOT EXISTS cart_item_add_ons (
  id TEXT PRIMARY KEY NOT NULL,
  cart_item_id TEXT NOT NULL REFERENCES cart_items(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  gift_add_on_id TEXT NOT NULL REFERENCES gift_add_ons(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  price_vnd INTEGER NOT NULL CHECK (price_vnd >= 0)
) STRICT;

CREATE TABLE IF NOT EXISTS wishlists (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at_utc TEXT NOT NULL CHECK (substr(created_at_utc, -1) = 'Z'),
  updated_at_utc TEXT NOT NULL CHECK (substr(updated_at_utc, -1) = 'Z')
) STRICT;

CREATE TABLE IF NOT EXISTS wishlist_items (
  id TEXT PRIMARY KEY NOT NULL,
  wishlist_id TEXT NOT NULL REFERENCES wishlists(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at_utc TEXT NOT NULL CHECK (substr(created_at_utc, -1) = 'Z')
) STRICT;

CREATE TABLE IF NOT EXISTS delivery_drafts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  delivery_date TEXT CHECK (delivery_date IS NULL OR length(delivery_date) = 10),
  slot_id TEXT CHECK (slot_id IS NULL OR length(slot_id) BETWEEN 1 AND 80),
  timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh' CHECK (timezone = 'Asia/Ho_Chi_Minh'),
  business_rule_version TEXT NOT NULL CHECK (length(business_rule_version) BETWEEN 1 AND 80),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at_utc TEXT NOT NULL CHECK (substr(updated_at_utc, -1) = 'Z'),
  CHECK (
    (delivery_date IS NULL AND slot_id IS NULL)
    OR (delivery_date IS NOT NULL AND slot_id IS NOT NULL)
  )
) STRICT;

CREATE TABLE IF NOT EXISTS orders (
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
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cod_mock', 'bank_transfer_mock')),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('mock_pending', 'mock_recorded', 'mock_cancelled')),
  created_at_utc TEXT NOT NULL CHECK (substr(created_at_utc, -1) = 'Z'),
  updated_at_utc TEXT NOT NULL CHECK (substr(updated_at_utc, -1) = 'Z'),
  CHECK (
    (buyer_contact_ciphertext IS NULL AND recipient_ciphertext IS NULL
      AND delivery_address_ciphertext IS NULL AND gift_message_ciphertext IS NULL)
    OR fulfilment_key_version IS NOT NULL
  )
) STRICT;

CREATE TABLE IF NOT EXISTS order_items (
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

CREATE TABLE IF NOT EXISTS order_item_add_ons (
  id TEXT PRIMARY KEY NOT NULL,
  order_item_id TEXT NOT NULL REFERENCES order_items(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  gift_add_on_id TEXT REFERENCES gift_add_ons(id) ON UPDATE RESTRICT ON DELETE SET NULL,
  add_on_id_snapshot TEXT NOT NULL CHECK (length(add_on_id_snapshot) BETWEEN 1 AND 80),
  add_on_name_snapshot TEXT NOT NULL CHECK (length(add_on_name_snapshot) BETWEEN 1 AND 120),
  price_vnd INTEGER NOT NULL CHECK (price_vnd >= 0)
) STRICT;

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (length(action) BETWEEN 1 AND 80),
  key_hash TEXT NOT NULL CHECK (length(key_hash) = 64),
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  response_status INTEGER CHECK (response_status IS NULL OR response_status BETWEEN 100 AND 599),
  response_body_reference TEXT CHECK (response_body_reference IS NULL OR length(response_body_reference) <= 255),
  created_at_utc TEXT NOT NULL CHECK (substr(created_at_utc, -1) = 'Z'),
  expires_at_utc TEXT NOT NULL CHECK (substr(expires_at_utc, -1) = 'Z')
) STRICT;

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  actor_user_id TEXT REFERENCES users(id) ON UPDATE RESTRICT ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (length(action) BETWEEN 1 AND 100),
  entity_type TEXT NOT NULL CHECK (length(entity_type) BETWEEN 1 AND 80),
  entity_id TEXT NOT NULL CHECK (length(entity_id) BETWEEN 1 AND 120),
  result TEXT NOT NULL CHECK (result IN ('success', 'failure', 'denied')),
  request_id TEXT CHECK (request_id IS NULL OR length(request_id) <= 120),
  status_before TEXT CHECK (status_before IS NULL OR length(status_before) <= 80),
  status_after TEXT CHECK (status_after IS NULL OR length(status_after) <= 80),
  metadata_version TEXT NOT NULL CHECK (length(metadata_version) BETWEEN 1 AND 40),
  created_at_utc TEXT NOT NULL CHECK (substr(created_at_utc, -1) = 'Z')
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_catalogue_versions_active
ON catalogue_versions(active) WHERE active = 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_provider_subject
ON users(auth_provider, provider_subject);

CREATE INDEX IF NOT EXISTS idx_users_role_status
ON users(role, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_products_slug
ON products(slug);

CREATE INDEX IF NOT EXISTS idx_products_active_purchase_price
ON products(active, purchase_type, price_vnd, sort_order);

CREATE INDEX IF NOT EXISTS idx_products_collection_active
ON products(collection, active, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_variants_product_type_code
ON product_variants(product_id, option_type, code);

CREATE INDEX IF NOT EXISTS idx_product_variants_product_active
ON product_variants(product_id, active, option_type, sort_order);

CREATE INDEX IF NOT EXISTS idx_product_relations_related
ON product_relations(related_product_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bouquet_options_type_code
ON bouquet_options(option_type, option_code);

CREATE INDEX IF NOT EXISTS idx_bouquet_options_type_active
ON bouquet_options(option_type, active, sort_order);

CREATE INDEX IF NOT EXISTS idx_gift_add_ons_active
ON gift_add_ons(active, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS uq_carts_user_active
ON carts(user_id) WHERE state = 'active';

CREATE INDEX IF NOT EXISTS idx_carts_user_state_updated
ON carts(user_id, state, updated_at_utc DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cart_items_cart_line
ON cart_items(cart_id, line_key);

CREATE INDEX IF NOT EXISTS idx_cart_items_product
ON cart_items(product_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cart_item_add_ons_item_addon
ON cart_item_add_ons(cart_item_id, gift_add_on_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wishlists_user
ON wishlists(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wishlist_items_wishlist_product
ON wishlist_items(wishlist_id, product_id);

CREATE INDEX IF NOT EXISTS idx_wishlist_items_product
ON wishlist_items(product_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_drafts_user
ON delivery_drafts(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_order_code
ON orders(order_code);

CREATE INDEX IF NOT EXISTS idx_orders_user_created_at
ON orders(user_id, created_at_utc DESC);

CREATE INDEX IF NOT EXISTS idx_orders_status_created_at
ON orders(status, created_at_utc DESC);

CREATE INDEX IF NOT EXISTS idx_order_items_order
ON order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_product
ON order_items(product_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_order_item_add_ons_item_addon
ON order_item_add_ons(order_item_id, add_on_id_snapshot);

CREATE UNIQUE INDEX IF NOT EXISTS uq_idempotency_user_action_key
ON idempotency_keys(user_id, action, key_hash);

CREATE INDEX IF NOT EXISTS idx_idempotency_expiry
ON idempotency_keys(expires_at_utc);

CREATE INDEX IF NOT EXISTS idx_audit_events_actor_created
ON audit_events(actor_user_id, created_at_utc DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_entity_action_created
ON audit_events(entity_type, entity_id, action, created_at_utc DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_created
ON audit_events(created_at_utc DESC);

INSERT INTO schema_versions (version, name, checksum, applied_at_utc)
VALUES (
  '0001_phase16_foundation',
  'Phase 16 D1 foundation',
  'fc3cdd6421cd5389e0d47cd112a7032ec6e2ecde664f2833837cc9d181556c56',
  '2026-08-24T00:00:00.000Z'
)
ON CONFLICT(version) DO NOTHING;

PRAGMA optimize;
