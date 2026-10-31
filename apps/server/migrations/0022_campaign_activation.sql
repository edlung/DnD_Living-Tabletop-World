-- Stage440 / ADR0038. A matching440-aware application is required for recovery.
CREATE TABLE ltw_workshop_campaign_activations (
  activation_id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  draft_id uuid NOT NULL,
  campaign_id text NOT NULL UNIQUE,
  bootstrap_command_id text NOT NULL UNIQUE,
  auth_session_id uuid NOT NULL,
  request_id uuid NOT NULL,
  request_fingerprint text NOT NULL CHECK(request_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  revision integer NOT NULL CHECK(revision BETWEEN 1 AND 1000000),
  package_digest text NOT NULL CHECK(package_digest ~ '^sha256:[0-9a-f]{64}$'),
  plan_digest text NOT NULL CHECK(plan_digest ~ '^sha256:[0-9a-f]{64}$'),
  manifest_digest text NOT NULL CHECK(manifest_digest ~ '^sha256:[0-9a-f]{64}$'),
  text_only boolean NOT NULL,
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
  language text NOT NULL CHECK(language IN ('en','ru')),
  frozen jsonb NOT NULL CHECK(jsonb_typeof(frozen)='object'),
  frozen_digest text NOT NULL CHECK(frozen_digest ~ '^sha256:[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'PROVISIONING' CHECK(status IN ('PROVISIONING','PUBLISHED')),
  phase text NOT NULL DEFAULT 'RESERVED' CHECK(phase IN ('RESERVED','CONTENT_READY','BOOTSTRAPPED','PUBLISHED')),
  failure_code text CHECK(failure_code ~ '^[A-Z][A-Z0-9_]{0,99}$'),
  retryable boolean NOT NULL DEFAULT true,
  fence bigint NOT NULL DEFAULT 0 CHECK(fence>=0),
  worker_id uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  published_at timestamptz,
  UNIQUE(owner_id,draft_id),
  UNIQUE(owner_id,draft_id,activation_id),
  UNIQUE(owner_id,draft_id,request_id),
  FOREIGN KEY(draft_id,owner_id) REFERENCES ltw_workshop_drafts(draft_id,owner_id),
  FOREIGN KEY(auth_session_id,owner_id) REFERENCES ltw_workshop_sessions(session_id,owner_id),
  FOREIGN KEY(draft_id,revision) REFERENCES ltw_campaign_package_revisions(draft_id,revision),
  CHECK((status='PUBLISHED')=(phase='PUBLISHED')),
  CHECK((status='PUBLISHED')=(published_at IS NOT NULL)),
  CHECK(status<>'PUBLISHED' OR lease_until IS NULL),
  CHECK(lease_until IS NULL OR worker_id IS NOT NULL)
);
CREATE INDEX ltw_campaign_activation_pending ON ltw_workshop_campaign_activations(status,next_attempt_at,lease_until,created_at);
CREATE INDEX ltw_campaign_activation_owned ON ltw_workshop_campaign_activations(owner_id,published_at DESC,activation_id DESC) WHERE status='PUBLISHED';

CREATE TABLE ltw_campaign_initial_content (
  campaign_id text PRIMARY KEY REFERENCES ltw_workshop_campaign_activations(campaign_id),
  activation_id uuid NOT NULL UNIQUE REFERENCES ltw_workshop_campaign_activations(activation_id),
  scenario jsonb NOT NULL CHECK(jsonb_typeof(scenario)='object'),
  quests jsonb NOT NULL CHECK(jsonb_typeof(quests)='array'),
  assets jsonb NOT NULL CHECK(jsonb_typeof(assets)='array'),
  scenario_digest text NOT NULL CHECK(scenario_digest ~ '^sha256:[0-9a-f]{64}$'),
  quest_digest text NOT NULL CHECK(quest_digest ~ '^sha256:[0-9a-f]{64}$'),
  manifest_digest text NOT NULL CHECK(manifest_digest ~ '^sha256:[0-9a-f]{64}$'),
  plan_digest text NOT NULL CHECK(plan_digest ~ '^sha256:[0-9a-f]{64}$'),
  content_digest text NOT NULL CHECK(content_digest ~ '^sha256:[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION ltw_campaign_activation_control() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'activation source is immutable'; END IF;
  IF (to_jsonb(NEW)-ARRAY['status','phase','failure_code','retryable','fence','worker_id','lease_until','next_attempt_at','updated_at','published_at'])
    <> (to_jsonb(OLD)-ARRAY['status','phase','failure_code','retryable','fence','worker_id','lease_until','next_attempt_at','updated_at','published_at'])
    OR OLD.status='PUBLISHED' OR NEW.fence<OLD.fence
    OR array_position(ARRAY['RESERVED','CONTENT_READY','BOOTSTRAPPED','PUBLISHED'],NEW.phase)
       < array_position(ARRAY['RESERVED','CONTENT_READY','BOOTSTRAPPED','PUBLISHED'],OLD.phase) THEN
    RAISE EXCEPTION 'activation source and publication are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ltw_campaign_activation_control BEFORE UPDATE OR DELETE ON ltw_workshop_campaign_activations
  FOR EACH ROW EXECUTE FUNCTION ltw_campaign_activation_control();
CREATE TRIGGER ltw_campaign_activation_no_truncate BEFORE TRUNCATE ON ltw_workshop_campaign_activations
  FOR EACH STATEMENT EXECUTE FUNCTION ltw_workshop_immutable();
CREATE TRIGGER ltw_campaign_initial_content_immutable BEFORE UPDATE OR DELETE ON ltw_campaign_initial_content
  FOR EACH ROW EXECUTE FUNCTION ltw_workshop_immutable();
CREATE TRIGGER ltw_campaign_initial_content_no_truncate BEFORE TRUNCATE ON ltw_campaign_initial_content
  FOR EACH STATEMENT EXECUTE FUNCTION ltw_workshop_immutable();
