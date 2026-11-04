-- The DM's library (Stage 680b, docs/adr/0058-campaign-content.md §3–4): handouts kept for later
-- and random tables, the DM's preparation beside the world, never canonical and never a player's
-- to read. The body is the entry as the DM wrote it (contracts `keptHandoutSchema`,
-- `randomTableSchema`), read back through that schema. A kept handout given is a handout
-- (migration 0032) and stays here with when it was last given; a roll on a table is a table roll
-- (migration 0025). Additive: an older build never reads the table.

CREATE TABLE ltw_dm_library (
  campaign_id text NOT NULL CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  entry_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('handout', 'table')),
  body jsonb NOT NULL CHECK (jsonb_typeof(body) = 'object' AND octet_length(body::text) <= 65536),
  updated_at timestamptz NOT NULL,
  given_at timestamptz,
  PRIMARY KEY (campaign_id, entry_id),
  CHECK (kind = 'handout' OR given_at IS NULL)
);
CREATE INDEX ltw_dm_library_by_campaign ON ltw_dm_library (campaign_id, updated_at DESC);
