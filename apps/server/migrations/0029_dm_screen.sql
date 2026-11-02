-- The DM's screen (docs/adr/0043-dm-screen.md, Stage 620). Additive: an older build ignores both.
-- A check asked of several characters at once shares a group, so the DM reads its results together.
ALTER TABLE ltw_check_requests ADD COLUMN group_id uuid;
CREATE INDEX ltw_check_requests_groups ON ltw_check_requests (campaign_id, group_id)
  WHERE group_id IS NOT NULL;

-- The DM's notes: descriptive DM data beside the world (like the DM's substitution reasons), never
-- canonical state and never shown to anyone but the campaign's DM.
CREATE TABLE ltw_dm_notes (
  campaign_id text NOT NULL CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  note_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (char_length(body) <= 8000),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  CHECK (updated_at >= created_at),
  PRIMARY KEY (campaign_id, note_id)
);
CREATE INDEX ltw_dm_notes_by_campaign ON ltw_dm_notes (campaign_id, updated_at DESC)
  WHERE deleted_at IS NULL;

-- The table's state around a session: at the table or online, paused or not, the characters whose
-- players are absent. Table control beside the world, never canonical; one row per campaign.
CREATE TABLE ltw_table_states (
  campaign_id text PRIMARY KEY CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  mode text NOT NULL CHECK (mode IN ('table', 'online')),
  paused boolean NOT NULL,
  absent jsonb NOT NULL CHECK (jsonb_typeof(absent) = 'array'),
  updated_at timestamptz NOT NULL
);
