-- Stage430 / ADR0038: private immutable locks and reviewed revision operations.
-- Recovery after EDIT jobs or locks exist requires a430-aware application.
ALTER TABLE ltw_campaign_generation_jobs
  ADD COLUMN mode text NOT NULL DEFAULT 'GENERATE' CHECK (mode IN ('GENERATE','EDIT')),
  ADD COLUMN lock_version integer NOT NULL DEFAULT 0 CHECK (lock_version >= 0),
  ADD COLUMN edit_spec jsonb,
  ADD CONSTRAINT ltw_generation_edit_spec CHECK ((mode='EDIT')=(edit_spec IS NOT NULL)),
  ADD CONSTRAINT ltw_generation_edit_object CHECK (edit_spec IS NULL OR jsonb_typeof(edit_spec)='object'),
  ADD CONSTRAINT ltw_generation_edit_never_attached CHECK (mode<>'EDIT' OR attached_revision IS NULL);

CREATE TABLE ltw_campaign_draft_lock_versions (
  owner_id uuid NOT NULL,
  draft_id uuid NOT NULL,
  version integer NOT NULL CHECK (version >= 0),
  revision integer NOT NULL CHECK (revision > 0),
  package_digest text NOT NULL CHECK (package_digest ~ '^sha256:[0-9a-f]{64}$'),
  manifest_digest text NOT NULL CHECK (manifest_digest ~ '^sha256:[0-9a-f]{64}$'),
  entries jsonb NOT NULL CHECK (jsonb_typeof(entries)='array'),
  digest text NOT NULL CHECK (digest ~ '^sha256:[0-9a-f]{64}$'),
  request_id uuid,
  request_fingerprint text CHECK (request_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (owner_id,draft_id,version),
  UNIQUE (owner_id,draft_id,request_id),
  FOREIGN KEY (draft_id,owner_id) REFERENCES ltw_workshop_drafts(draft_id,owner_id),
  FOREIGN KEY (draft_id,revision) REFERENCES ltw_campaign_package_revisions(draft_id,revision),
  CHECK ((request_id IS NULL)=(request_fingerprint IS NULL)),
  CHECK ((version=0)=(request_id IS NULL))
);
CREATE TABLE ltw_campaign_revision_write_receipts (
  owner_id uuid NOT NULL,
  draft_id uuid NOT NULL,
  request_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('MANUAL','GENERATION','ADOPTION','RESTORE')),
  intent jsonb NOT NULL CHECK (jsonb_typeof(intent)='object'),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  revision integer NOT NULL CHECK (revision > 0),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (owner_id,draft_id,request_id),
  FOREIGN KEY (draft_id,owner_id) REFERENCES ltw_workshop_drafts(draft_id,owner_id),
  FOREIGN KEY (draft_id,revision) REFERENCES ltw_campaign_package_revisions(draft_id,revision)
);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['ltw_campaign_draft_lock_versions','ltw_campaign_revision_write_receipts'] LOOP
    EXECUTE format('CREATE TRIGGER ltw_revision_control_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION ltw_workshop_immutable()',t);
    EXECUTE format('CREATE TRIGGER ltw_revision_control_no_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION ltw_workshop_immutable()',t);
  END LOOP;
END $$;
