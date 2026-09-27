-- Optional wishes, not confirmed delivery. Existing consultation snapshots remain valid.
ALTER TABLE consultation_requests ADD COLUMN desired_date TEXT
  CHECK (desired_date IS NULL OR (length(desired_date) = 10 AND desired_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'));
ALTER TABLE consultation_requests ADD COLUMN desired_time_slot TEXT
  CHECK (desired_time_slot IS NULL OR desired_time_slot IN ('09:00 – 12:00', '13:00 – 17:00', '17:00 – 20:00'));

INSERT INTO schema_versions (version, name, checksum, applied_at_utc)
VALUES ('0012_consultation_preferences', 'Consultation desired date and time snapshot',
  '3fad60d302caf60b0dc9e391edf0d666ef3d572af128971fa489d9fa82165d37', '2026-09-27T00:00:00.000Z');
