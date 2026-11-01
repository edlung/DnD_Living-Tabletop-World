-- The table's rolls and the DM's check requests (Stage 510, docs/PRODUCT_COMPLETION_PLAN.md
-- decision 4). Rolled by the server, kept beside the world and never canonical history: a free
-- roll or a check changes nothing in the world until the DM decides it does. Rolls are
-- append-only; a request changes only from open to rolled or cancelled.

CREATE TABLE ltw_table_rolls (
  campaign_id text NOT NULL CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  roll_id uuid NOT NULL,
  roller_id text CHECK (roller_id IS NULL OR roller_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  subject jsonb NOT NULL,
  groups jsonb NOT NULL,
  hidden boolean NOT NULL,
  request_id uuid,
  created_at timestamptz NOT NULL,
  position bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY (campaign_id, roll_id)
);
CREATE INDEX ltw_table_rolls_recent ON ltw_table_rolls (campaign_id, position DESC);

CREATE TRIGGER ltw_table_rolls_append_only BEFORE UPDATE OR DELETE
  ON ltw_table_rolls FOR EACH ROW EXECUTE FUNCTION ltw_reject_history_rewrite();
CREATE TRIGGER ltw_table_rolls_no_truncate BEFORE TRUNCATE
  ON ltw_table_rolls FOR EACH STATEMENT EXECUTE FUNCTION ltw_reject_history_rewrite();

CREATE TABLE ltw_check_requests (
  campaign_id text NOT NULL CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  request_id uuid NOT NULL,
  character_id text NOT NULL CHECK (character_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  check_spec jsonb NOT NULL,
  mode text NOT NULL CHECK (mode IN ('normal', 'advantage', 'disadvantage')),
  dc integer CHECK (dc IS NULL OR dc BETWEEN 1 AND 40),
  status text NOT NULL CHECK (status IN ('open', 'rolled', 'cancelled')),
  roll_id uuid,
  total integer,
  created_at timestamptz NOT NULL,
  position bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY (campaign_id, request_id),
  CHECK ((status = 'rolled') = (roll_id IS NOT NULL AND total IS NOT NULL))
);
CREATE INDEX ltw_check_requests_recent ON ltw_check_requests (campaign_id, position DESC);
