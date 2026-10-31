-- Stage 400: genuine workshop preparation subjects, never fictitious campaigns/play sessions.
CREATE TABLE ltw_ai_preparation_grants (
  approval_id text NOT NULL REFERENCES ltw_ai_approvals (approval_id),
  owner_id uuid NOT NULL REFERENCES ltw_workshop_owners (owner_id),
  revision integer NOT NULL CHECK (revision > 0),
  enabled boolean NOT NULL,
  authorized_by text NOT NULL,
  authorized_on date NOT NULL,
  authorization_source text NOT NULL CHECK (length(authorization_source) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (approval_id, owner_id, revision)
);
CREATE TABLE ltw_ai_preparation_sessions (
  preparation_session_id uuid PRIMARY KEY,
  job_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  draft_id uuid NOT NULL,
  auth_session_id uuid NOT NULL,
  job_fence bigint NOT NULL CHECK (job_fence > 0),
  approval_id text NOT NULL REFERENCES ltw_ai_approvals (approval_id),
  grant_revision integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (job_id, job_fence, approval_id),
  FOREIGN KEY (job_id, owner_id, draft_id, auth_session_id)
    REFERENCES ltw_campaign_generation_jobs (job_id, owner_id, draft_id, auth_session_id),
  FOREIGN KEY (approval_id, owner_id, grant_revision)
    REFERENCES ltw_ai_preparation_grants (approval_id, owner_id, revision)
);
CREATE TRIGGER ltw_ai_preparation_grants_append_only BEFORE UPDATE OR DELETE
  ON ltw_ai_preparation_grants FOR EACH ROW EXECUTE FUNCTION ltw_reject_history_rewrite();
CREATE TRIGGER ltw_ai_preparation_grants_no_truncate BEFORE TRUNCATE
  ON ltw_ai_preparation_grants FOR EACH STATEMENT EXECUTE FUNCTION ltw_reject_history_rewrite();
CREATE TRIGGER ltw_ai_preparation_sessions_append_only BEFORE UPDATE OR DELETE
  ON ltw_ai_preparation_sessions FOR EACH ROW EXECUTE FUNCTION ltw_reject_history_rewrite();
CREATE TRIGGER ltw_ai_preparation_sessions_no_truncate BEFORE TRUNCATE
  ON ltw_ai_preparation_sessions FOR EACH STATEMENT EXECUTE FUNCTION ltw_reject_history_rewrite();

ALTER TABLE ltw_ai_requests ALTER COLUMN campaign_id DROP NOT NULL;
ALTER TABLE ltw_ai_requests DROP CONSTRAINT ltw_ai_requests_session_class_check;
ALTER TABLE ltw_ai_requests ADD CONSTRAINT ltw_ai_requests_session_class_check
  CHECK (session_class IN ('play', 'evaluation', 'preparation'));
ALTER TABLE ltw_ai_requests ADD COLUMN subject_kind text NOT NULL DEFAULT 'campaign';
ALTER TABLE ltw_ai_requests ADD COLUMN workshop_owner_id uuid;
ALTER TABLE ltw_ai_requests ADD COLUMN workshop_draft_id uuid;
ALTER TABLE ltw_ai_requests ADD COLUMN preparation_session_id uuid REFERENCES ltw_ai_preparation_sessions;
ALTER TABLE ltw_ai_requests ADD COLUMN subject_key text GENERATED ALWAYS AS
  (CASE WHEN subject_kind = 'campaign' THEN 'campaign:' || campaign_id
   ELSE 'workshop:' || workshop_owner_id::text || ':' || workshop_draft_id::text END) STORED;
ALTER TABLE ltw_ai_requests ADD CONSTRAINT ltw_ai_requests_subject_check CHECK (
  (subject_kind = 'campaign' AND campaign_id IS NOT NULL AND workshop_owner_id IS NULL
   AND workshop_draft_id IS NULL AND preparation_session_id IS NULL
   AND capability <> 'campaign-preparation' AND session_class IS DISTINCT FROM 'preparation')
  OR (subject_kind = 'workshop' AND campaign_id IS NULL AND workshop_owner_id IS NOT NULL
   AND workshop_draft_id IS NOT NULL AND preparation_session_id IS NOT NULL
   AND session_class IS NOT NULL AND session_id IS NOT NULL
   AND session_class = 'preparation' AND session_id = preparation_session_id::text
   AND purpose = 'campaign-preparation' AND capability = 'campaign-preparation'));

ALTER TABLE ltw_ai_attempts ALTER COLUMN campaign_id DROP NOT NULL;
ALTER TABLE ltw_ai_attempts DROP CONSTRAINT ltw_ai_attempts_session_class_check;
ALTER TABLE ltw_ai_attempts ADD CONSTRAINT ltw_ai_attempts_session_class_check
  CHECK (session_class IN ('play', 'evaluation', 'preparation'));
ALTER TABLE ltw_ai_attempts ADD COLUMN subject_kind text NOT NULL DEFAULT 'campaign';
ALTER TABLE ltw_ai_attempts ADD COLUMN workshop_owner_id uuid;
ALTER TABLE ltw_ai_attempts ADD COLUMN workshop_draft_id uuid;
ALTER TABLE ltw_ai_attempts ADD COLUMN preparation_session_id uuid REFERENCES ltw_ai_preparation_sessions;
ALTER TABLE ltw_ai_attempts ADD COLUMN subject_key text GENERATED ALWAYS AS
  (CASE WHEN subject_kind = 'campaign' THEN 'campaign:' || campaign_id
   ELSE 'workshop:' || workshop_owner_id::text || ':' || workshop_draft_id::text END) STORED;
ALTER TABLE ltw_ai_attempts ADD CONSTRAINT ltw_ai_attempts_subject_check CHECK (
  (subject_kind = 'campaign' AND campaign_id IS NOT NULL AND workshop_owner_id IS NULL
   AND workshop_draft_id IS NULL AND preparation_session_id IS NULL
   AND capability <> 'campaign-preparation' AND session_class <> 'preparation')
  OR (subject_kind = 'workshop' AND campaign_id IS NULL AND workshop_owner_id IS NOT NULL
   AND workshop_draft_id IS NOT NULL AND preparation_session_id IS NOT NULL
   AND session_class = 'preparation' AND session_id = preparation_session_id::text
   AND capability = 'campaign-preparation'));
CREATE INDEX ltw_ai_attempts_by_subject_day ON ltw_ai_attempts (subject_key, billing_day);

ALTER TABLE ltw_ai_traces ALTER COLUMN campaign_id DROP NOT NULL;
ALTER TABLE ltw_ai_traces ADD COLUMN subject_kind text NOT NULL DEFAULT 'campaign';
ALTER TABLE ltw_ai_traces ADD COLUMN workshop_owner_id uuid;
ALTER TABLE ltw_ai_traces ADD COLUMN workshop_draft_id uuid;
ALTER TABLE ltw_ai_traces ADD COLUMN preparation_session_id uuid REFERENCES ltw_ai_preparation_sessions;
ALTER TABLE ltw_ai_traces ADD CONSTRAINT ltw_ai_traces_subject_check CHECK (
  (subject_kind = 'campaign' AND campaign_id IS NOT NULL AND workshop_owner_id IS NULL
   AND workshop_draft_id IS NULL AND preparation_session_id IS NULL AND purpose <> 'campaign-preparation')
  OR (subject_kind = 'workshop' AND campaign_id IS NULL AND workshop_owner_id IS NOT NULL
   AND workshop_draft_id IS NOT NULL AND preparation_session_id IS NOT NULL AND purpose = 'campaign-preparation'));
CREATE INDEX ltw_ai_traces_by_workshop ON ltw_ai_traces (workshop_owner_id, workshop_draft_id, created_at);
