-- The table's agreement (docs/adr/0071-memory-and-ritual.md §4, Stage 740): how this table plays —
-- the tone, what is not in this game, the sign for a pause, a word on ages — and, for each
-- character, the version they said "Understood" to. Table data beside the world, never canonical:
-- no World Engine decision reads it. Additive: an older build leaves both tables alone.
CREATE TABLE ltw_table_agreements (
  campaign_id text PRIMARY KEY CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  -- Grows with each change of the words.
  version integer NOT NULL CHECK (version >= 1),
  tone text NOT NULL CHECK (char_length(tone) BETWEEN 1 AND 40),
  tone_note text NOT NULL CHECK (char_length(tone_note) <= 200),
  -- The ticked "not in this game" keys.
  limits text[] NOT NULL CHECK (cardinality(limits) <= 32),
  also_not text NOT NULL CHECK (char_length(also_not) <= 400),
  pause_sign text NOT NULL CHECK (char_length(pause_sign) <= 200),
  ages text NOT NULL CHECK (char_length(ages) <= 200),
  updated_at timestamptz NOT NULL
);

CREATE TABLE ltw_table_agreement_understood (
  campaign_id text NOT NULL CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  character_id text NOT NULL CHECK (character_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$'),
  version integer NOT NULL CHECK (version >= 1),
  understood_at timestamptz NOT NULL,
  PRIMARY KEY (campaign_id, character_id)
);
