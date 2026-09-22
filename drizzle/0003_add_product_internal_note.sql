ALTER TABLE products ADD COLUMN internal_note TEXT;

INSERT INTO schema_versions (version, name, checksum, applied_at_utc)
VALUES (
  '0003_add_product_internal_note',
  'Add internal_note column to products table',
  '4c9e1e2d7f8d3c5f2b8a1e9c4d6f8a2b5e7c9d1a3f5b7e9c1d3f5a7b9c1d3f5a',
  '2026-09-22T00:00:00.000Z'
)
ON CONFLICT(version) DO NOTHING;
