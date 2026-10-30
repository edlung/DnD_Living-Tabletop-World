-- Stage 400 / ADR 0038: owner-private durable preparation, never played world state.
ALTER TABLE ltw_workshop_sessions ADD CONSTRAINT ltw_workshop_sessions_owner_pair UNIQUE (session_id, owner_id);
CREATE TABLE ltw_campaign_generation_jobs (
  job_id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  draft_id uuid NOT NULL,
  auth_session_id uuid NOT NULL,
  request_id uuid NOT NULL,
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  base_revision integer NOT NULL CHECK (base_revision BETWEEN 0 AND 999999),
  seed jsonb NOT NULL CHECK (jsonb_typeof(seed) = 'object'),
  retry_of uuid,
  pipeline_version integer NOT NULL DEFAULT 1 CHECK (pipeline_version = 1),
  status text NOT NULL CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED','DISPATCH_UNKNOWN')),
  fence bigint NOT NULL DEFAULT 0 CHECK (fence >= 0),
  worker_id uuid,
  lease_until timestamptz,
  next_step integer NOT NULL DEFAULT 0 CHECK (next_step BETWEEN 0 AND 7),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  attached_revision integer CHECK (attached_revision > 0),
  candidate_available boolean NOT NULL DEFAULT false,
  failure_code text CHECK (length(failure_code) BETWEEN 1 AND 100),
  UNIQUE (owner_id,draft_id,request_id),
  UNIQUE (owner_id,draft_id,job_id),
  UNIQUE (job_id,owner_id,draft_id,auth_session_id),
  FOREIGN KEY (draft_id,owner_id) REFERENCES ltw_workshop_drafts (draft_id,owner_id),
  FOREIGN KEY (auth_session_id,owner_id) REFERENCES ltw_workshop_sessions (session_id,owner_id),
  FOREIGN KEY (owner_id,draft_id,retry_of) REFERENCES ltw_campaign_generation_jobs (owner_id,draft_id,job_id),
  CHECK ((status = 'RUNNING') = (lease_until IS NOT NULL)),
  CHECK (status <> 'RUNNING' OR worker_id IS NOT NULL),
  CHECK (attached_revision IS NULL OR (status = 'SUCCEEDED' AND candidate_available))
);
CREATE INDEX ltw_campaign_generation_pending ON ltw_campaign_generation_jobs (status,lease_until,created_at);
CREATE INDEX ltw_campaign_generation_owner ON ltw_campaign_generation_jobs (owner_id,draft_id,created_at DESC,job_id DESC);
CREATE TABLE ltw_campaign_generation_steps (
  owner_id uuid NOT NULL, draft_id uuid NOT NULL, job_id uuid NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 0 AND 6),
  input jsonb NOT NULL CHECK (jsonb_typeof(input) = 'object'),
  prompt text NOT NULL CHECK (length(prompt) BETWEEN 1 AND 1048576),
  provider text NOT NULL CHECK (length(provider) BETWEEN 1 AND 100),
  model text NOT NULL CHECK (length(model) BETWEEN 1 AND 200),
  trace_id uuid NOT NULL,
  input_digest text NOT NULL CHECK (input_digest ~ '^sha256:[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (owner_id,draft_id,job_id,ordinal),
  FOREIGN KEY (owner_id,draft_id,job_id) REFERENCES ltw_campaign_generation_jobs (owner_id,draft_id,job_id)
);
CREATE TABLE ltw_campaign_generation_dispatches (
  owner_id uuid NOT NULL, draft_id uuid NOT NULL, job_id uuid NOT NULL, ordinal integer NOT NULL,
  fence bigint NOT NULL, dispatched_at timestamptz NOT NULL,
  PRIMARY KEY (owner_id,draft_id,job_id,ordinal),
  FOREIGN KEY (owner_id,draft_id,job_id,ordinal) REFERENCES ltw_campaign_generation_steps (owner_id,draft_id,job_id,ordinal)
);
CREATE TABLE ltw_campaign_generation_results (
  owner_id uuid NOT NULL, draft_id uuid NOT NULL, job_id uuid NOT NULL, ordinal integer NOT NULL,
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  content_digest text NOT NULL CHECK (content_digest ~ '^sha256:[0-9a-f]{64}$'),
  provider_request_id text CHECK (length(provider_request_id) BETWEEN 1 AND 500),
  completed_at timestamptz NOT NULL,
  PRIMARY KEY (owner_id,draft_id,job_id,ordinal),
  FOREIGN KEY (owner_id,draft_id,job_id,ordinal) REFERENCES ltw_campaign_generation_dispatches (owner_id,draft_id,job_id,ordinal)
);
CREATE TABLE ltw_campaign_generation_candidates (
  owner_id uuid NOT NULL, draft_id uuid NOT NULL, job_id uuid NOT NULL,
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  content_digest text NOT NULL CHECK (content_digest ~ '^sha256:[0-9a-f]{64}$'),
  source jsonb NOT NULL CHECK (jsonb_typeof(source) = 'object'),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (owner_id,draft_id,job_id),
  FOREIGN KEY (owner_id,draft_id,job_id) REFERENCES ltw_campaign_generation_jobs (owner_id,draft_id,job_id)
);
CREATE FUNCTION ltw_campaign_generation_control() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'generation history is immutable'; END IF;
  IF (to_jsonb(NEW) - ARRAY['status','fence','worker_id','lease_until','next_step','updated_at','attached_revision','candidate_available','failure_code'])
    <> (to_jsonb(OLD) - ARRAY['status','fence','worker_id','lease_until','next_step','updated_at','attached_revision','candidate_available','failure_code'])
    OR NEW.fence < OLD.fence OR NEW.next_step < OLD.next_step
    OR OLD.status IN ('SUCCEEDED','FAILED','CANCELLED','DISPATCH_UNKNOWN') THEN
    RAISE EXCEPTION 'generation identity and terminal state are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ltw_campaign_generation_control BEFORE UPDATE OR DELETE ON ltw_campaign_generation_jobs
  FOR EACH ROW EXECUTE FUNCTION ltw_campaign_generation_control();
CREATE TRIGGER ltw_campaign_generation_no_truncate BEFORE TRUNCATE ON ltw_campaign_generation_jobs
  FOR EACH STATEMENT EXECUTE FUNCTION ltw_workshop_immutable();
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['steps','dispatches','results','candidates'] LOOP
    EXECUTE format('CREATE TRIGGER ltw_generation_immutable BEFORE UPDATE OR DELETE ON ltw_campaign_generation_%I FOR EACH ROW EXECUTE FUNCTION ltw_workshop_immutable()', t);
    EXECUTE format('CREATE TRIGGER ltw_generation_no_truncate BEFORE TRUNCATE ON ltw_campaign_generation_%I FOR EACH STATEMENT EXECUTE FUNCTION ltw_workshop_immutable()', t);
  END LOOP;
END $$;
