-- AI spending accounting (docs/adr/0032-live-ai.md, amendment 2026-10-11;
-- docs/STAGE_300_REMEDIATION_DESIGN.md §1–2). Operational operator/DM data, not
-- canonical state: every table is append-only and nothing references the event store.
-- Money is integer microdollars. Ceilings are mandatory and positive.

-- Operator records: written only by the operator CLI under the exclusive policy lock.

CREATE TABLE ltw_ai_billing_accounts (
  account_id text PRIMARY KEY,
  -- Operator-attested provider billing-account reference; unique against accidental duplicates.
  provider_account_ref text NOT NULL UNIQUE,
  owner_id text NOT NULL,
  authorized_on date NOT NULL,
  authorization_source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE ltw_ai_account_revisions (
  account_id text NOT NULL REFERENCES ltw_ai_billing_accounts,
  revision integer NOT NULL CHECK (revision >= 1),
  global_daily_ceiling_micros bigint NOT NULL CHECK (global_daily_ceiling_micros > 0),
  enabled boolean NOT NULL,
  owner_id text NOT NULL,
  authorized_on date NOT NULL,
  authorization_source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (account_id, revision)
);

CREATE TABLE ltw_ai_approvals (
  approval_id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES ltw_ai_billing_accounts,
  -- One explicit owner spending grant cannot back two approvals.
  grant_reference text NOT NULL UNIQUE,
  stage text NOT NULL,
  owner_id text NOT NULL,
  authorized_on date NOT NULL,
  authorization_source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (approval_id, grant_reference)
);

-- The global daily ceiling is the account's; an approval revision has no column for it.
CREATE TABLE ltw_ai_approval_revisions (
  approval_id text NOT NULL,
  revision integer NOT NULL CHECK (revision >= 1),
  grant_reference text NOT NULL,
  stage_ceiling_micros bigint NOT NULL CHECK (stage_ceiling_micros > 0),
  campaign_daily_ceiling_micros bigint NOT NULL CHECK (campaign_daily_ceiling_micros > 0),
  play_session_ceiling_micros bigint NOT NULL CHECK (play_session_ceiling_micros > 0),
  evaluation_run_ceiling_micros bigint NOT NULL CHECK (evaluation_run_ceiling_micros > 0),
  campaign_ids text[] NOT NULL CHECK (cardinality(campaign_ids) >= 1),
  enabled boolean NOT NULL,
  owner_id text NOT NULL,
  authorized_on date NOT NULL,
  authorization_source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (approval_id, revision),
  FOREIGN KEY (approval_id, grant_reference)
    REFERENCES ltw_ai_approvals (approval_id, grant_reference)
);

CREATE TABLE ltw_ai_evaluation_runs (
  run_id text PRIMARY KEY,
  approval_id text NOT NULL REFERENCES ltw_ai_approvals,
  campaign_id text NOT NULL,
  owner_id text NOT NULL,
  authorized_on date NOT NULL,
  authorization_source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE ltw_ai_evidence_batches (
  batch_id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES ltw_ai_billing_accounts,
  provider text NOT NULL,
  model text NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL CHECK (window_end > window_start),
  invoiced_total_micros bigint NOT NULL CHECK (invoiced_total_micros >= 0),
  evidence_reference text NOT NULL,
  owner_id text NOT NULL,
  authorized_on date NOT NULL,
  authorization_source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Journal. A request ID is also its parent trace ID; no foreign key to ltw_ai_traces,
-- since an orphan start after a process kill is legitimate held spending.

CREATE TABLE ltw_ai_requests (
  request_id uuid PRIMARY KEY,
  campaign_id text NOT NULL,
  actor_id text NOT NULL,
  purpose text NOT NULL,
  capability text NOT NULL,
  scope text NOT NULL,
  source_ids jsonb NOT NULL,
  approval_id text REFERENCES ltw_ai_approvals,
  session_class text CHECK (session_class IN ('play', 'evaluation')),
  session_id text,
  configured_model text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deadline_at timestamptz NOT NULL,
  CHECK ((session_class IS NULL) = (session_id IS NULL))
);

CREATE INDEX ltw_ai_requests_by_deadline ON ltw_ai_requests (deadline_at);

-- Attempt start and its reservation are one row, inserted by admission in one transaction.
CREATE TABLE ltw_ai_attempts (
  attempt_id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES ltw_ai_requests,
  account_id text NOT NULL REFERENCES ltw_ai_billing_accounts,
  approval_id text NOT NULL REFERENCES ltw_ai_approvals,
  campaign_id text NOT NULL,
  session_class text NOT NULL CHECK (session_class IN ('play', 'evaluation')),
  session_id text NOT NULL,
  billing_day date NOT NULL,
  capability text NOT NULL,
  attempt_kind text NOT NULL CHECK (attempt_kind IN ('initial', 'repair', 'switch')),
  provider text NOT NULL,
  model text NOT NULL,
  pricing_version text NOT NULL,
  reserved_micros bigint NOT NULL CHECK (reserved_micros > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX ltw_ai_attempts_by_account_day ON ltw_ai_attempts (account_id, billing_day);
CREATE INDEX ltw_ai_attempts_by_campaign_day ON ltw_ai_attempts (campaign_id, billing_day);
CREATE INDEX ltw_ai_attempts_by_session
  ON ltw_ai_attempts (approval_id, campaign_id, session_class, session_id);
CREATE INDEX ltw_ai_attempts_by_request ON ltw_ai_attempts (request_id);

-- Every charge is an absolute amount; effective charge is a maximum, never a sum of deltas.
CREATE TABLE ltw_ai_accounting (
  entry_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES ltw_ai_attempts,
  kind text NOT NULL CHECK (kind IN ('settled', 'released_pre_dispatch', 'reconciled', 'evidence')),
  transition_key text NOT NULL UNIQUE,
  charge_micros bigint NOT NULL CHECK (charge_micros >= 0),
  usage jsonb,
  returned_model text,
  provider_request_id text,
  batch_id text REFERENCES ltw_ai_evidence_batches,
  owner_id text,
  authorized_on date,
  authorization_source text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (kind <> 'released_pre_dispatch' OR charge_micros = 0),
  CHECK (kind <> 'reconciled' OR owner_id IS NOT NULL)
);

-- Exactly one terminal row per attempt, across kinds; evidence rows are excluded.
CREATE UNIQUE INDEX ltw_ai_accounting_one_terminal
  ON ltw_ai_accounting (attempt_id) WHERE kind <> 'evidence';
CREATE INDEX ltw_ai_accounting_by_attempt ON ltw_ai_accounting (attempt_id);

-- Restrictive stops; approval_id NULL stops the whole billing account (for the provider/model given).
CREATE TABLE ltw_ai_stops (
  stop_id uuid PRIMARY KEY,
  account_id text NOT NULL REFERENCES ltw_ai_billing_accounts,
  approval_id text REFERENCES ltw_ai_approvals,
  provider text,
  model text,
  reason text NOT NULL
    CHECK (reason IN ('OVERRUN', 'DISCREPANCY', 'UNEXPECTED_MODEL', 'UNVERIFIED_BILLING')),
  attempt_id uuid REFERENCES ltw_ai_attempts,
  -- The model a provider actually reported, when it was not the expected one.
  observed_model text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (model IS NULL OR provider IS NOT NULL)
);

CREATE INDEX ltw_ai_stops_by_account ON ltw_ai_stops (account_id);

CREATE TABLE ltw_ai_stop_clearances (
  stop_id uuid PRIMARY KEY REFERENCES ltw_ai_stops,
  owner_id text NOT NULL,
  authorized_on date NOT NULL,
  authorization_source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- One caller outcome per request: the live frozen result's digest, or recovery's marker.
CREATE TABLE ltw_ai_request_outcomes (
  request_id uuid PRIMARY KEY REFERENCES ltw_ai_requests,
  kind text NOT NULL CHECK (kind IN ('live', 'recovered_incomplete')),
  status text,
  provider text,
  trace_digest text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (
    (kind = 'live' AND status IS NOT NULL AND trace_digest IS NOT NULL)
    OR (kind = 'recovered_incomplete' AND status IS NULL AND provider IS NULL
        AND trace_digest IS NULL)
  )
);

DO $$
DECLARE
  name text;
BEGIN
  FOREACH name IN ARRAY ARRAY[
    'ltw_ai_billing_accounts', 'ltw_ai_account_revisions', 'ltw_ai_approvals',
    'ltw_ai_approval_revisions', 'ltw_ai_evaluation_runs', 'ltw_ai_evidence_batches',
    'ltw_ai_requests', 'ltw_ai_attempts', 'ltw_ai_accounting', 'ltw_ai_stops',
    'ltw_ai_stop_clearances', 'ltw_ai_request_outcomes'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION ltw_reject_history_rewrite()',
      name || '_append_only', name);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE TRUNCATE ON %I '
      'FOR EACH STATEMENT EXECUTE FUNCTION ltw_reject_history_rewrite()',
      name || '_no_truncate', name);
  END LOOP;
END;
$$;
