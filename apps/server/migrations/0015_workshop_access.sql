-- Stage 380 / ADR 0038: independent workshop credentials and private draft containers.
-- No workshop row is a campaign membership or canonical world fact.
CREATE TABLE ltw_workshop_owners (
  owner_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL
);
CREATE TABLE ltw_workshop_invitations (
  invitation_id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES ltw_workshop_owners (owner_id),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  authorization_source text NOT NULL CHECK (length(authorization_source) BETWEEN 1 AND 200),
  used_at timestamptz,
  revoked_at timestamptz,
  UNIQUE (invitation_id, owner_id),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '7 days'),
  CHECK (used_at IS NULL OR used_at >= created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);
CREATE INDEX ltw_workshop_invitations_owner ON ltw_workshop_invitations (owner_id);
CREATE TABLE ltw_workshop_sessions (
  session_id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES ltw_workshop_owners (owner_id),
  invitation_id uuid NOT NULL UNIQUE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  FOREIGN KEY (invitation_id, owner_id) REFERENCES ltw_workshop_invitations (invitation_id, owner_id),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '14 days'),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);
CREATE INDEX ltw_workshop_sessions_owner ON ltw_workshop_sessions (owner_id);
CREATE TABLE ltw_workshop_revocations (
  revocation_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES ltw_workshop_owners (owner_id),
  at timestamptz NOT NULL,
  authorization_source text NOT NULL CHECK (length(authorization_source) BETWEEN 1 AND 200)
);
CREATE TABLE ltw_workshop_drafts (
  draft_id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES ltw_workshop_owners (owner_id),
  request_id uuid NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  language text NOT NULL CHECK (language IN ('ru', 'en')),
  created_at timestamptz NOT NULL,
  UNIQUE (owner_id, request_id)
);
CREATE INDEX ltw_workshop_drafts_owner ON ltw_workshop_drafts (owner_id, created_at DESC, draft_id DESC);

-- Credentials are immutable apart from the one-way terminal timestamps.
CREATE FUNCTION ltw_workshop_one_way() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'workshop history cannot be deleted';
  END IF;
  IF (to_jsonb(NEW) - 'used_at' - 'revoked_at') <> (to_jsonb(OLD) - 'used_at' - 'revoked_at')
    OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
    OR (TG_TABLE_NAME = 'ltw_workshop_invitations' AND
       (to_jsonb(OLD)->>'used_at') IS NOT NULL AND
       (to_jsonb(NEW)->>'used_at') IS DISTINCT FROM (to_jsonb(OLD)->>'used_at')) THEN
    RAISE EXCEPTION 'workshop credentials are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ltw_workshop_invitations_one_way BEFORE UPDATE OR DELETE ON ltw_workshop_invitations
  FOR EACH ROW EXECUTE FUNCTION ltw_workshop_one_way();
CREATE TRIGGER ltw_workshop_sessions_one_way BEFORE UPDATE OR DELETE ON ltw_workshop_sessions
  FOR EACH ROW EXECUTE FUNCTION ltw_workshop_one_way();
CREATE FUNCTION ltw_workshop_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'workshop ownership and audit history are immutable';
END;
$$;
CREATE TRIGGER ltw_workshop_owners_immutable BEFORE UPDATE OR DELETE ON ltw_workshop_owners
  FOR EACH ROW EXECUTE FUNCTION ltw_workshop_immutable();
CREATE TRIGGER ltw_workshop_revocations_immutable BEFORE UPDATE OR DELETE ON ltw_workshop_revocations
  FOR EACH ROW EXECUTE FUNCTION ltw_workshop_immutable();
CREATE TRIGGER ltw_workshop_drafts_immutable BEFORE UPDATE OR DELETE ON ltw_workshop_drafts
  FOR EACH ROW EXECUTE FUNCTION ltw_workshop_immutable();
CREATE TRIGGER ltw_workshop_owners_no_truncate BEFORE TRUNCATE ON ltw_workshop_owners
  FOR EACH STATEMENT EXECUTE FUNCTION ltw_workshop_immutable();
CREATE TRIGGER ltw_workshop_invitations_no_truncate BEFORE TRUNCATE ON ltw_workshop_invitations
  FOR EACH STATEMENT EXECUTE FUNCTION ltw_workshop_immutable();
CREATE TRIGGER ltw_workshop_sessions_no_truncate BEFORE TRUNCATE ON ltw_workshop_sessions
  FOR EACH STATEMENT EXECUTE FUNCTION ltw_workshop_immutable();
CREATE TRIGGER ltw_workshop_revocations_no_truncate BEFORE TRUNCATE ON ltw_workshop_revocations
  FOR EACH STATEMENT EXECUTE FUNCTION ltw_workshop_immutable();
CREATE TRIGGER ltw_workshop_drafts_no_truncate BEFORE TRUNCATE ON ltw_workshop_drafts
  FOR EACH STATEMENT EXECUTE FUNCTION ltw_workshop_immutable();
