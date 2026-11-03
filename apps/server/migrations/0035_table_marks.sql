-- The table's shared marks on the board (Stage 670c, docs/adr/0057-encounters-maps-loot.md §5):
-- pings, the DM's pointer, strokes and laid areas for the live session, kept beside the world and
-- never canonical, each the mark of one run of a fight (its start's event ID); and whether the DM
-- lets players mark. Additive: an older build never reads them.

CREATE TABLE ltw_table_marks (
  campaign_id text NOT NULL CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  fight_id uuid NOT NULL,
  mark_id uuid NOT NULL,
  author_id text NOT NULL,
  by_dm boolean NOT NULL,
  kind text NOT NULL CHECK (kind IN ('ping', 'pointer', 'stroke', 'area')),
  body jsonb NOT NULL CHECK (jsonb_typeof(body) = 'object' AND octet_length(body::text) <= 65536),
  created_at timestamptz NOT NULL,
  expires_at timestamptz,
  PRIMARY KEY (campaign_id, mark_id)
);
CREATE INDEX ltw_table_marks_by_fight ON ltw_table_marks (campaign_id, fight_id, created_at);

CREATE TABLE ltw_table_mark_settings (
  campaign_id text PRIMARY KEY CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  players_may_mark boolean NOT NULL
);
