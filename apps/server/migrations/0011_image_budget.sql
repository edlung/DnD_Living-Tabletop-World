-- The image spending ledger (docs/adr/0035-images.md §2; docs/STAGE_330_DESIGN.md, "Spending for
-- in-play images"; apps/server/src/images/AGENTS.md). Operational operator and accounting data,
-- not canonical state: nothing here references the event store. Append-only like the event store.
-- (Version 0010 belongs to Stage 340.)

-- The image ceiling: append-only revisions, each with the owner's recorded authorization, written
-- only by `pnpm ai:operator image-budget-set`. The latest revision is the ceiling; without one, or
-- with a ceiling of zero, no image provider is called.
CREATE TABLE ltw_image_budget (
  revision integer PRIMARY KEY CHECK (revision >= 1),
  ceiling_micros bigint NOT NULL CHECK (ceiling_micros >= 0),
  owner_id text NOT NULL CHECK (char_length(owner_id) BETWEEN 1 AND 200),
  authorized_on date NOT NULL,
  authorization_source text NOT NULL CHECK (char_length(authorization_source) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- A reservation of a worst-case amount, made before a provider call against the ceiling.
CREATE TABLE ltw_image_charges (
  charge_id uuid PRIMARY KEY,
  campaign_id text NOT NULL CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  request_id text NOT NULL CHECK (char_length(request_id) BETWEEN 1 AND 310),
  provider text NOT NULL CHECK (provider ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 100),
  reserved_micros bigint NOT NULL CHECK (reserved_micros > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- At most one settlement per reservation: the provider's reported cost, the whole reservation
-- when the cost is unknown, or nothing when the request was never sent. A charge without a
-- settlement counts its whole reservation.
CREATE TABLE ltw_image_settlements (
  charge_id uuid PRIMARY KEY REFERENCES ltw_image_charges (charge_id),
  outcome text NOT NULL
    CHECK (outcome IN ('generated', 'refused', 'failed', 'timeout', 'not-sent')),
  charged_micros bigint NOT NULL CHECK (charged_micros >= 0),
  cost_reported boolean NOT NULL,
  returned_model text CHECK (returned_model IS NULL OR char_length(returned_model) BETWEEN 1 AND 128),
  provider_request_id text
    CHECK (provider_request_id IS NULL OR char_length(provider_request_id) BETWEEN 1 AND 128),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (outcome <> 'not-sent' OR (charged_micros = 0 AND NOT cost_reported))
);

CREATE TRIGGER ltw_image_budget_append_only BEFORE UPDATE OR DELETE
  ON ltw_image_budget FOR EACH ROW EXECUTE FUNCTION ltw_reject_history_rewrite();
CREATE TRIGGER ltw_image_budget_no_truncate BEFORE TRUNCATE
  ON ltw_image_budget FOR EACH STATEMENT EXECUTE FUNCTION ltw_reject_history_rewrite();
CREATE TRIGGER ltw_image_charges_append_only BEFORE UPDATE OR DELETE
  ON ltw_image_charges FOR EACH ROW EXECUTE FUNCTION ltw_reject_history_rewrite();
CREATE TRIGGER ltw_image_charges_no_truncate BEFORE TRUNCATE
  ON ltw_image_charges FOR EACH STATEMENT EXECUTE FUNCTION ltw_reject_history_rewrite();
CREATE TRIGGER ltw_image_settlements_append_only BEFORE UPDATE OR DELETE
  ON ltw_image_settlements FOR EACH ROW EXECUTE FUNCTION ltw_reject_history_rewrite();
CREATE TRIGGER ltw_image_settlements_no_truncate BEFORE TRUNCATE
  ON ltw_image_settlements FOR EACH STATEMENT EXECUTE FUNCTION ltw_reject_history_rewrite();
