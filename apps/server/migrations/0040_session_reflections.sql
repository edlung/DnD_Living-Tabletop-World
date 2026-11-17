-- Stars and wishes at an evening's end (docs/adr/0071-memory-and-ritual.md §2, Stage 720): what
-- each player, and the DM, liked and wishes for. Table data beside the world, never canonical: no
-- World Engine decision reads it. One row for each author of each session, replaced when written
-- again and removed when emptied. Additive: an older build leaves the table alone.
CREATE TABLE ltw_session_reflections (
  campaign_id text NOT NULL CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  session_id text NOT NULL CHECK (session_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$'),
  -- Whose words: a character's ID, or the empty string for the DM's own.
  author_id text NOT NULL CHECK (author_id = '' OR author_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$'),
  -- Read by everyone at the table.
  star text NOT NULL CHECK (char_length(star) <= 280),
  -- Read by its author and the DM.
  wish text NOT NULL CHECK (char_length(wish) <= 280),
  written_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (updated_at >= written_at),
  CHECK (char_length(star) + char_length(wish) > 0),
  PRIMARY KEY (campaign_id, session_id, author_id)
);
