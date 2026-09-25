CREATE TABLE occupancy_collection_runs (
  slot timestamptz PRIMARY KEY,
  attempt_id uuid NOT NULL,
  status text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  fetched_at timestamptz,
  finished_at timestamptz,
  http_status integer,
  error text,
  parser_version text NOT NULL,
  CONSTRAINT occupancy_run_status_valid CHECK (status IN ('running', 'success', 'partial', 'failed'))
);
CREATE TABLE facility_occupancy_samples (
  slot timestamptz NOT NULL REFERENCES occupancy_collection_runs(slot),
  facility_id uuid NOT NULL,
  status text NOT NULL,
  occupancy integer,
  capacity integer,
  ratio numeric,
  error text,
  CONSTRAINT occupancy_sample_status_valid CHECK (status IN ('ok', 'missing', 'invalid')),
  CONSTRAINT occupancy_sample_values_valid CHECK (
    (status = 'ok' AND occupancy IS NOT NULL AND occupancy >= 0 AND capacity IS NOT NULL AND capacity > 0 AND ratio IS NOT NULL AND ratio >= 0)
    OR (status IN ('missing', 'invalid') AND occupancy IS NULL AND capacity IS NULL AND ratio IS NULL)
  )
);
CREATE UNIQUE INDEX occupancy_samples_slot_facility_unique ON facility_occupancy_samples(slot, facility_id);
CREATE INDEX occupancy_samples_facility_slot_idx ON facility_occupancy_samples(facility_id, slot);
