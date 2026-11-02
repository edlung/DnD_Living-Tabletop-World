-- The table display and the table's join link (docs/adr/0042-table-display.md, Stage 610).
-- Credentials and presentation, not canonical state: a display is a device paired to one campaign
-- that reads the PARTY view; a cast is what the DM shows on it; a table link seats accounts in free
-- seats through ordinary single-use invitations. Tokens and codes are stored as SHA-256 hashes.

CREATE TABLE ltw_displays (
  display_id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  -- The pairing code's hash while the device waits for the DM; cleared once paired. A device that
  -- never paired is pruned a day after its code expired (it holds no campaign's history).
  code_hash text UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  code_expires_at timestamptz NOT NULL,
  campaign_id text CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  name text CHECK (char_length(name) BETWEEN 1 AND 40),
  paired_by text CHECK (paired_by ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$'),
  created_at timestamptz NOT NULL,
  paired_at timestamptz,
  -- Absolute: 30 days from the pairing request.
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '30 days'),
  CHECK (code_expires_at > created_at AND code_expires_at <= created_at + interval '15 minutes'),
  CHECK ((campaign_id IS NULL) = (paired_at IS NULL)),
  CHECK ((campaign_id IS NULL) = (name IS NULL)),
  CHECK ((campaign_id IS NULL) = (paired_by IS NULL)),
  CHECK (campaign_id IS NULL OR code_hash IS NULL),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);
CREATE INDEX ltw_displays_by_campaign ON ltw_displays (campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX ltw_displays_by_expiry ON ltw_displays (expires_at);
CREATE INDEX ltw_displays_waiting ON ltw_displays (code_expires_at) WHERE campaign_id IS NULL;

-- A display's identity never changes; pairing happens once; revocation is final; only a device
-- that never paired is ever deleted.
CREATE FUNCTION ltw_display_one_way() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.campaign_id IS NULL THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'ltw paired displays are never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.token_hash <> OLD.token_hash OR NEW.created_at <> OLD.created_at
     OR NEW.expires_at <> OLD.expires_at
     OR (OLD.campaign_id IS NOT NULL AND NEW.campaign_id IS DISTINCT FROM OLD.campaign_id)
     OR (OLD.paired_at IS NOT NULL AND NEW.paired_at IS DISTINCT FROM OLD.paired_at)
     OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
     OR (OLD.code_hash IS NULL AND NEW.code_hash IS NOT NULL) THEN
    RAISE EXCEPTION 'ltw displays change one way only' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ltw_displays_one_way
  BEFORE UPDATE OR DELETE ON ltw_displays
  FOR EACH ROW EXECUTE FUNCTION ltw_display_one_way();

-- What the DM shows on the campaign's displays: one current cast per campaign, its revision growing.
CREATE TABLE ltw_display_casts (
  campaign_id text PRIMARY KEY CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  cast_view jsonb NOT NULL,
  revision integer NOT NULL CHECK (revision >= 1),
  updated_at timestamptz NOT NULL
);

-- The table's join link: open for a few hours, seats accounts in free seats, closed by the DM.
CREATE TABLE ltw_table_links (
  link_id uuid PRIMARY KEY,
  campaign_id text NOT NULL CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  code_hash text NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  created_by text NOT NULL CHECK (created_by ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$'),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  closed_at timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '24 hours'),
  CHECK (closed_at IS NULL OR closed_at >= created_at)
);
CREATE INDEX ltw_table_links_by_campaign ON ltw_table_links (campaign_id);

-- Who a table link seated: each seat's single-use invitation, minted from the link.
CREATE TABLE ltw_table_link_seats (
  link_id uuid NOT NULL REFERENCES ltw_table_links (link_id),
  invitation_id uuid NOT NULL UNIQUE REFERENCES ltw_auth_invitations (invitation_id),
  character_id text NOT NULL CHECK (character_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$'),
  seated_at timestamptz NOT NULL,
  PRIMARY KEY (link_id, invitation_id)
);
