-- "I'll come / I can't" for the next game (docs/adr/0073-table-ideas.md §10, Stage 890): one answer
-- a character for the date as it stands. `game_at` is the date the answer was given for: an answer
-- for another instant than the table's date is not read, so a changed date asks again without a
-- write. Table data beside the world, never canonical. Additive: an older build leaves the table
-- alone and shows the date without answers.
CREATE TABLE ltw_next_game_answers (
  campaign_id text NOT NULL CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  character_id text NOT NULL CHECK (character_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$'),
  game_at timestamptz NOT NULL,
  coming text NOT NULL CHECK (coming IN ('yes', 'no')),
  answered_at timestamptz NOT NULL,
  PRIMARY KEY (campaign_id, character_id)
);
