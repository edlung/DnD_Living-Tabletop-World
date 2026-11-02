-- Accounts (docs/adr/0041-accounts.md, Stage 600): a login and a password that hold a person's
-- seats, their sessions and their reset links. Credentials, not canonical state: membership is the
-- World Engine's roster; a seat only says which actor an account is in a campaign. Tokens are
-- stored as SHA-256 hashes; passwords as scrypt hashes; neither ever in plain text.

CREATE TABLE ltw_accounts (
  account_id uuid PRIMARY KEY,
  login text NOT NULL UNIQUE CHECK (login ~ '^[a-z0-9._-]{3,32}$'),
  password_hash text NOT NULL CHECK (password_hash ~ '^scrypt\$[0-9]+\$[0-9]+\$[0-9]+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$'),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL,
  password_changed_at timestamptz NOT NULL,
  CHECK (password_changed_at >= created_at)
);

-- Which actor an account is in each campaign: one seat per campaign, one account per actor.
CREATE TABLE ltw_account_seats (
  account_id uuid NOT NULL REFERENCES ltw_accounts (account_id),
  campaign_id text NOT NULL CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  actor_id text NOT NULL CHECK (actor_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$'),
  role text NOT NULL CHECK (role IN ('dm', 'player')),
  invitation_id uuid NOT NULL REFERENCES ltw_auth_invitations (invitation_id),
  joined_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, campaign_id),
  UNIQUE (campaign_id, actor_id)
);

CREATE TABLE ltw_account_sessions (
  session_id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  account_id uuid NOT NULL REFERENCES ltw_accounts (account_id),
  created_at timestamptz NOT NULL,
  -- Absolute: 30 days from sign-in, never extended.
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '30 days'),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);
CREATE INDEX ltw_account_sessions_by_account ON ltw_account_sessions (account_id);
CREATE INDEX ltw_account_sessions_by_expiry ON ltw_account_sessions (expires_at);

CREATE TABLE ltw_account_resets (
  reset_id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  account_id uuid NOT NULL REFERENCES ltw_accounts (account_id),
  created_by text NOT NULL CHECK (created_by ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$'),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '7 days'),
  CHECK (used_at IS NULL OR used_at >= created_at)
);

-- A credential never comes back: what identifies a session or a reset never changes, and revoked
-- and used are set once.
CREATE FUNCTION ltw_account_one_way() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ltw account credentials are never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.token_hash <> OLD.token_hash OR NEW.account_id <> OLD.account_id
     OR NEW.created_at <> OLD.created_at OR NEW.expires_at <> OLD.expires_at THEN
    RAISE EXCEPTION 'ltw account credentials change one way only' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_TABLE_NAME = 'ltw_account_sessions' THEN
    IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
      RAISE EXCEPTION 'ltw account credentials change one way only' USING ERRCODE = 'restrict_violation';
    END IF;
  ELSIF OLD.used_at IS NOT NULL AND NEW.used_at IS DISTINCT FROM OLD.used_at THEN
    RAISE EXCEPTION 'ltw account credentials change one way only' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ltw_account_sessions_one_way
  BEFORE UPDATE OR DELETE ON ltw_account_sessions
  FOR EACH ROW EXECUTE FUNCTION ltw_account_one_way();
CREATE TRIGGER ltw_account_resets_one_way
  BEFORE UPDATE OR DELETE ON ltw_account_resets
  FOR EACH ROW EXECUTE FUNCTION ltw_account_one_way();
