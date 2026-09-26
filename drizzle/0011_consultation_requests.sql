-- Non-commercial selections. No ownership, contact PII, payment or order links.
CREATE TABLE consultation_requests (
  id TEXT PRIMARY KEY NOT NULL,
  reference_code TEXT NOT NULL UNIQUE CHECK (reference_code GLOB 'HP-*'),
  idempotency_key_hash TEXT NOT NULL UNIQUE CHECK (length(idempotency_key_hash) = 64),
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
  reference_total INTEGER NOT NULL CHECK (reference_total >= 0),
  notification_status TEXT NOT NULL DEFAULT 'pending' CHECK (notification_status IN ('pending', 'sent', 'partial', 'failed')),
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL
) STRICT;
CREATE INDEX idx_consultations_created ON consultation_requests(created_at_utc DESC, id);
CREATE TABLE consultation_request_items (
  id TEXT PRIMARY KEY NOT NULL,
  consultation_request_id TEXT NOT NULL REFERENCES consultation_requests(id) ON DELETE CASCADE,
  product_id TEXT,
  product_name_snapshot TEXT NOT NULL,
  image_url_snapshot TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  unit_reference_price INTEGER NOT NULL CHECK (unit_reference_price >= 0),
  line_reference_total INTEGER NOT NULL CHECK (line_reference_total = unit_reference_price * quantity),
  selections_json TEXT NOT NULL CHECK (json_valid(selections_json) AND json_type(selections_json) = 'object'),
  sort_order INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_consultation_items_request ON consultation_request_items(consultation_request_id, sort_order);
INSERT INTO schema_versions (version, name, checksum, applied_at_utc)
VALUES ('0011_consultation_requests', 'Non-commercial consultation snapshots',
  '41afc6fddc8bc69e91449159a32eb72e27bd1e18b02c71bf3b73271ae0b5ab21', '2026-09-26T00:00:00.000Z');
