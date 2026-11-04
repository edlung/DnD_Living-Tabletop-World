-- The DM's saved encounters (Stage 670a, docs/adr/0057-encounters-maps-loot.md §1): the DM's
-- preparation beside the world, never canonical. The body is the encounter as the DM built it
-- (contracts `savedEncounterRequestSchema`), read back through that schema. Additive: an older
-- build never reads the table.

CREATE TABLE ltw_saved_encounters (
  campaign_id text NOT NULL CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  encounter_id uuid NOT NULL,
  body jsonb NOT NULL CHECK (jsonb_typeof(body) = 'object' AND octet_length(body::text) <= 65536),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (campaign_id, encounter_id)
);
CREATE INDEX ltw_saved_encounters_by_campaign ON ltw_saved_encounters (campaign_id, updated_at DESC);
