-- A hero's backstory and a player's private notes (docs/adr/0073-table-ideas.md §5, Stage 840).
-- Table data beside the world, never canonical: no World Engine decision reads either. Additive:
-- an older build leaves both tables alone.

-- One backstory a character: the hero's, read and written by its player and the DM.
CREATE TABLE ltw_backstories (
  campaign_id text NOT NULL CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  character_id text NOT NULL CHECK (character_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$'),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  -- Who wrote it last: the character's player, or the DM (for a child who told it aloud).
  written_by text NOT NULL CHECK (written_by IN ('player', 'dm')),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (campaign_id, character_id)
);

-- A player's private notes: the person's who wrote them (their actor in the campaign), as the
-- character they play. Nobody else reads them — not the DM, not whoever takes the seat later.
-- Deleted for good on their owner's word, and when their owner's account is deleted.
CREATE TABLE ltw_player_notes (
  campaign_id text NOT NULL CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  owner_id text NOT NULL CHECK (char_length(owner_id) BETWEEN 1 AND 200),
  character_id text NOT NULL CHECK (character_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$'),
  note_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(title) <= 120),
  body text NOT NULL CHECK (char_length(body) <= 4000),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (updated_at >= created_at),
  CHECK (char_length(title) + char_length(body) > 0),
  PRIMARY KEY (campaign_id, owner_id, note_id)
);
CREATE INDEX ltw_player_notes_of ON ltw_player_notes (campaign_id, owner_id, character_id, updated_at DESC);
