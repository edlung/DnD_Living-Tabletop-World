-- Production sign-in (docs/adr/0036-production-sign-in.md; docs/STAGE_340_DESIGN.md):
-- single-use invitations and cookie sessions, stored only as SHA-256 hashes of their tokens,
-- and the evidence of redeem attempts. Credentials, not canonical state: who is a member is
-- the World Engine's roster. Unlike the event store these rows change (used, revoked, last
-- seen), as the ADR decides; triggers keep those changes one-way.

CREATE TABLE ltw_auth_invitations (
  invitation_id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  campaign_id text NOT NULL CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  purpose text NOT NULL CHECK (purpose IN ('player', 'dm')),
  character_id text CHECK (character_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  -- The DM's actor, or `operator` for the operator CLI.
  created_by text NOT NULL CHECK (created_by ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$'),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  -- The actor it signs in: the DM's from the start; a player's once a redeem claimed it.
  actor_id text CHECK (actor_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$'),
  used_at timestamptz,
  revoked_at timestamptz,
  CHECK ((purpose = 'player') = (character_id IS NOT NULL)),
  CHECK (purpose = 'player' OR actor_id IS NOT NULL),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '7 days'),
  CHECK (used_at IS NULL OR (actor_id IS NOT NULL AND used_at >= created_at)),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

-- The DM's listing, newest first, and a seat's open invitations.
CREATE INDEX ltw_auth_invitations_by_campaign
  ON ltw_auth_invitations (campaign_id, created_at DESC);
CREATE INDEX ltw_auth_invitations_open
  ON ltw_auth_invitations (campaign_id, character_id)
  WHERE used_at IS NULL AND revoked_at IS NULL;

CREATE TABLE ltw_auth_sessions (
  session_id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  campaign_id text NOT NULL CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  actor_id text NOT NULL CHECK (actor_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$'),
  invitation_id uuid NOT NULL REFERENCES ltw_auth_invitations (invitation_id),
  created_at timestamptz NOT NULL,
  -- Absolute: 14 days from sign-in, never extended.
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '14 days'),
  CHECK (last_seen_at >= created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

-- Revocation and the DM's member list by actor; pruning by expiry.
CREATE INDEX ltw_auth_sessions_by_actor ON ltw_auth_sessions (campaign_id, actor_id);
CREATE INDEX ltw_auth_sessions_by_expiry ON ltw_auth_sessions (expires_at);

-- Evidence of redeem attempts. Keys are HMACs under a key that lives in the server process
-- only: rows count distinct sources, never reveal an address or a token prefix. Pruned.
CREATE TABLE ltw_auth_attempts (
  attempt_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('redeemed', 'refused', 'limited')),
  source_key text NOT NULL CHECK (source_key ~ '^[0-9a-f]{64}$'),
  prefix_key text CHECK (prefix_key ~ '^[0-9a-f]{64}$')
);

CREATE INDEX ltw_auth_attempts_by_time ON ltw_auth_attempts (at);

-- A credential never comes back: what identifies it never changes, and used, revoked and the
-- claimed actor are set once; a session is only ever seen later. Invitations stay for the DM.
CREATE FUNCTION ltw_auth_one_way() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ltw invitations are never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.token_hash <> OLD.token_hash OR NEW.campaign_id <> OLD.campaign_id
     OR NEW.created_at <> OLD.created_at OR NEW.expires_at <> OLD.expires_at
     OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
    RAISE EXCEPTION 'ltw credentials change one way only' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_TABLE_NAME = 'ltw_auth_invitations' THEN
    IF NEW.purpose <> OLD.purpose OR NEW.character_id IS DISTINCT FROM OLD.character_id
       OR (OLD.used_at IS NOT NULL AND NEW.used_at IS DISTINCT FROM OLD.used_at)
       OR (OLD.actor_id IS NOT NULL AND NEW.actor_id IS DISTINCT FROM OLD.actor_id) THEN
      RAISE EXCEPTION 'ltw credentials change one way only' USING ERRCODE = 'restrict_violation';
    END IF;
  ELSIF NEW.actor_id <> OLD.actor_id OR NEW.last_seen_at < OLD.last_seen_at THEN
    RAISE EXCEPTION 'ltw credentials change one way only' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ltw_auth_invitations_one_way
  BEFORE UPDATE OR DELETE ON ltw_auth_invitations
  FOR EACH ROW EXECUTE FUNCTION ltw_auth_one_way();
CREATE TRIGGER ltw_auth_sessions_one_way
  BEFORE UPDATE ON ltw_auth_sessions
  FOR EACH ROW EXECUTE FUNCTION ltw_auth_one_way();
