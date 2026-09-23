export const D1_BINDING = 'DB'
export const MIGRATION_DIRECTORY = 'drizzle'
export const SCHEMA_VERSION = '0001_phase16_foundation'

export const TABLES = [
  'schema_versions',
  'catalogue_versions',
  'users',
  'products',
  'product_variants',
  'product_relations',
  'bouquet_options',
  'gift_add_ons',
  'carts',
  'cart_items',
  'cart_item_add_ons',
  'wishlists',
  'wishlist_items',
  'delivery_drafts',
  'orders',
  'order_items',
  'order_item_add_ons',
  'idempotency_keys',
  'audit_events',
] as const

export const QUERY_INDEXES = [
  'uq_catalogue_versions_active',
  'uq_users_provider_subject',
  'idx_users_role_status',
  'uq_products_slug',
  'idx_products_active_purchase_price',
  'idx_products_collection_active',
  'uq_product_variants_product_type_code',
  'idx_product_variants_product_active',
  'idx_product_relations_related',
  'uq_bouquet_options_type_code',
  'idx_bouquet_options_type_active',
  'idx_gift_add_ons_active',
  'uq_carts_user_active',
  'idx_carts_user_state_updated',
  'uq_cart_items_cart_line',
  'idx_cart_items_product',
  'uq_cart_item_add_ons_item_addon',
  'uq_wishlists_user',
  'uq_wishlist_items_wishlist_product',
  'idx_wishlist_items_product',
  'uq_delivery_drafts_user',
  'uq_orders_order_code',
  'idx_orders_user_created_at',
  'idx_orders_status_created_at',
  'idx_order_items_order',
  'idx_order_items_product',
  'uq_order_item_add_ons_item_addon',
  'uq_idempotency_user_action_key',
  'idx_idempotency_expiry',
  'idx_audit_events_actor_created',
  'idx_audit_events_entity_action_created',
  'idx_audit_events_created',
] as const

export const PAYMENT_METHODS = ['momo', 'bank_transfer'] as const
export const PURCHASE_TYPES = ['standard', 'priceless'] as const
