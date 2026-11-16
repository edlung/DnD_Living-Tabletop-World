-- A campaign's end and its heroes' keepsakes (docs/adr/0072-keepsakes.md §2, Stage 780): the DM
-- marks an adventure finished (the row; reopening deletes it), and each hero keeps one thing they
-- carry or one chapter of the party's story, with a line. Table data beside the world, never
-- canonical: no World Engine decision reads it. Additive: an older build leaves both tables alone
-- (and plays a finished campaign on, as it knows nothing of its end).
CREATE TABLE ltw_campaign_endings (
  campaign_id text PRIMARY KEY CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  finished_at timestamptz NOT NULL,
  -- The DM's last words to the table.
  line text NOT NULL CHECK (char_length(line) <= 280)
);

CREATE TABLE ltw_keepsakes (
  campaign_id text NOT NULL CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  character_id text NOT NULL CHECK (character_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$'),
  -- 'item' or 'chapter'; a later build may add kinds.
  kind text NOT NULL CHECK (char_length(kind) BETWEEN 1 AND 20),
  ref_id text NOT NULL CHECK (char_length(ref_id) BETWEEN 1 AND 128),
  -- The thing's or the chapter's name when it was chosen.
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 200),
  line text NOT NULL CHECK (char_length(line) <= 200),
  kept_at timestamptz NOT NULL,
  PRIMARY KEY (campaign_id, character_id)
);
