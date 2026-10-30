-- Stage420 / ADR0038: owner-private images, not canonical assets or world events.
-- Recovery after use requires an0019/0020-aware application.
CREATE TABLE ltw_workshop_image_jobs (
 job_id uuid PRIMARY KEY, owner_id uuid NOT NULL, draft_id uuid NOT NULL, auth_session_id uuid NOT NULL,
 request_id uuid NOT NULL, request_fingerprint text NOT NULL CHECK(request_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
 expected_manifest_version integer NOT NULL DEFAULT 0 CHECK(expected_manifest_version>=0),
 revision integer NOT NULL, package_digest text NOT NULL CHECK(package_digest ~ '^sha256:[0-9a-f]{64}$'),
 entity_id uuid NOT NULL, purpose text NOT NULL CHECK(purpose IN('image','figure','battle-map')),
 variant text NOT NULL CHECK(variant IN('reference','derived')), label text,
 input jsonb NOT NULL CHECK(jsonb_typeof(input)='object'),
 source_signature text NOT NULL CHECK(source_signature ~ '^sha256:[0-9a-f]{64}$'),
 provider text NOT NULL CHECK(length(provider) BETWEEN 1 AND 100),model text NOT NULL CHECK(length(model) BETWEEN 1 AND 200),
 request_digest text NOT NULL CHECK(request_digest ~ '^sha256:[0-9a-f]{64}$'),
 status text NOT NULL CHECK(status IN('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED','DISPATCH_UNKNOWN')),
 fence bigint NOT NULL DEFAULT 0 CHECK(fence>=0),worker_id uuid,lease_until timestamptz,charge_id uuid,
 failure_code text CHECK(length(failure_code) BETWEEN 1 AND 100),created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,
 UNIQUE(owner_id,draft_id,request_id),UNIQUE(owner_id,draft_id,job_id),UNIQUE(job_id,owner_id,draft_id,auth_session_id),
 FOREIGN KEY(draft_id,owner_id) REFERENCES ltw_workshop_drafts(draft_id,owner_id),
 FOREIGN KEY(draft_id,revision) REFERENCES ltw_campaign_package_revisions(draft_id,revision),
 FOREIGN KEY(auth_session_id,owner_id) REFERENCES ltw_workshop_sessions(session_id,owner_id),
 CHECK((status='RUNNING')=(lease_until IS NOT NULL)),
 CHECK(status<>'RUNNING' OR(worker_id IS NOT NULL AND charge_id IS NOT NULL)),
 CHECK((variant='reference' AND label IS NULL AND purpose='image') OR(variant='derived' AND label IS NOT NULL))
);
CREATE INDEX ltw_workshop_image_pending ON ltw_workshop_image_jobs(status,lease_until,created_at);
CREATE INDEX ltw_workshop_image_owner ON ltw_workshop_image_jobs(owner_id,draft_id,revision,created_at DESC,job_id DESC);
CREATE TABLE ltw_workshop_image_dispatches (
 owner_id uuid NOT NULL,draft_id uuid NOT NULL,job_id uuid NOT NULL,charge_id uuid NOT NULL UNIQUE,fence bigint NOT NULL,
 request_digest text NOT NULL CHECK(request_digest ~ '^sha256:[0-9a-f]{64}$'),dispatched_at timestamptz NOT NULL,
 PRIMARY KEY(owner_id,draft_id,job_id),
 FOREIGN KEY(owner_id,draft_id,job_id) REFERENCES ltw_workshop_image_jobs(owner_id,draft_id,job_id)
);
CREATE TABLE ltw_workshop_image_contents (
 owner_id uuid NOT NULL,draft_id uuid NOT NULL,content_hash text NOT NULL CHECK(content_hash ~ '^sha256:[0-9a-f]{64}$'),
 media_type text NOT NULL CHECK(media_type IN('image/png','image/webp')),
 bytes bytea NOT NULL CHECK(octet_length(bytes) BETWEEN 1 AND 2097152),created_at timestamptz NOT NULL,
 PRIMARY KEY(owner_id,draft_id,content_hash),FOREIGN KEY(draft_id,owner_id) REFERENCES ltw_workshop_drafts(draft_id,owner_id)
);
CREATE TABLE ltw_workshop_image_candidates (
 candidate_id uuid PRIMARY KEY,owner_id uuid NOT NULL,draft_id uuid NOT NULL,job_id uuid NOT NULL,created_at timestamptz NOT NULL,
 content_hash text NOT NULL,media_type text NOT NULL CHECK(media_type IN('image/png','image/webp')),
 UNIQUE(owner_id,draft_id,candidate_id),UNIQUE(owner_id,draft_id,job_id),
 FOREIGN KEY(owner_id,draft_id,job_id) REFERENCES ltw_workshop_image_dispatches(owner_id,draft_id,job_id),
 FOREIGN KEY(owner_id,draft_id,content_hash) REFERENCES ltw_workshop_image_contents(owner_id,draft_id,content_hash)
);
CREATE TABLE ltw_workshop_visual_manifests (
 owner_id uuid NOT NULL,draft_id uuid NOT NULL,revision integer NOT NULL,version integer NOT NULL CHECK(version>=0),
 package_digest text NOT NULL CHECK(package_digest ~ '^sha256:[0-9a-f]{64}$'),
 digest text NOT NULL CHECK(digest ~ '^sha256:[0-9a-f]{64}$'),entries jsonb NOT NULL CHECK(jsonb_typeof(entries)='array'),
 request_id uuid,request_fingerprint text,created_at timestamptz NOT NULL,
 PRIMARY KEY(owner_id,draft_id,revision,version),UNIQUE(owner_id,draft_id,request_id),
 FOREIGN KEY(draft_id,owner_id) REFERENCES ltw_workshop_drafts(draft_id,owner_id),
 FOREIGN KEY(draft_id,revision) REFERENCES ltw_campaign_package_revisions(draft_id,revision),
 CHECK((request_id IS NULL)=(request_fingerprint IS NULL)),
 CHECK((version=0)=(request_id IS NULL))
);
CREATE FUNCTION ltw_workshop_image_control() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'draft image history is immutable'; END IF;
 IF(to_jsonb(NEW)-ARRAY['status','fence','worker_id','lease_until','charge_id','failure_code','updated_at'])
   <>(to_jsonb(OLD)-ARRAY['status','fence','worker_id','lease_until','charge_id','failure_code','updated_at'])
   OR NEW.fence<OLD.fence OR OLD.status IN('SUCCEEDED','FAILED','CANCELLED','DISPATCH_UNKNOWN')
   OR(NEW.charge_id IS DISTINCT FROM OLD.charge_id AND NEW.fence<=OLD.fence) THEN
   RAISE EXCEPTION 'draft image identity and terminal state are immutable';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER ltw_workshop_image_control BEFORE UPDATE OR DELETE ON ltw_workshop_image_jobs
 FOR EACH ROW EXECUTE FUNCTION ltw_workshop_image_control();
CREATE TRIGGER ltw_workshop_image_no_truncate BEFORE TRUNCATE ON ltw_workshop_image_jobs
 FOR EACH STATEMENT EXECUTE FUNCTION ltw_workshop_immutable();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['ltw_workshop_image_dispatches','ltw_workshop_image_contents','ltw_workshop_image_candidates','ltw_workshop_visual_manifests'] LOOP
  EXECUTE format('CREATE TRIGGER ltw_workshop_image_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION ltw_workshop_immutable()',t);
  EXECUTE format('CREATE TRIGGER ltw_workshop_image_no_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION ltw_workshop_immutable()',t);
 END LOOP;
END $$;
