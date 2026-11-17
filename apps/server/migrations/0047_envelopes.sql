-- Sealed envelopes (docs/adr/0073-table-ideas.md §9, Stage 880): a handout from the DM's library
-- sealed for the party ahead of time. The party reads its outside (the label) while it is sealed;
-- its inside (title, text, pictured entity) is the DM's until it opens — on the DM's word, or when
-- the chapter of the evening it names is written — and is then given as a row of `ltw_handouts`.
-- Table data beside the world, never canonical. Additive: an older build leaves the table alone
-- and opens nothing by itself.
CREATE TABLE ltw_envelopes (
  campaign_id text NOT NULL CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  envelope_id uuid NOT NULL,
  -- The outside, for the party to read.
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 120),
  -- The inside: the handout it becomes.
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body text CHECK (body IS NULL OR char_length(body) BETWEEN 1 AND 2000),
  entity_id text CHECK (entity_id IS NULL OR entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$'),
  CHECK (body IS NOT NULL OR entity_id IS NOT NULL),
  -- What opens it: the DM's word, or the writing of an evening's chapter.
  opens text NOT NULL CHECK (opens IN ('word', 'chapter')),
  -- The evening whose chapter opens it; null for the DM's word, or for the next evening to end
  -- with a chapter.
  session_id text CHECK (session_id IS NULL OR session_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$'),
  CHECK (opens = 'chapter' OR session_id IS NULL),
  sealed_at timestamptz NOT NULL,
  -- Set once, when it opens; an opened envelope is never sealed again.
  opened_at timestamptz,
  opened_by text CHECK (opened_by IN ('word', 'chapter')),
  CHECK ((opened_at IS NULL) = (opened_by IS NULL)),
  CHECK (opened_at IS NULL OR opened_at >= sealed_at),
  PRIMARY KEY (campaign_id, envelope_id)
);
