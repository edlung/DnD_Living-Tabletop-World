-- Handouts (docs/adr/0044-online-play.md §5, Stage 630): what the DM shows one player, or the
-- party — a text, a picture of something the recipient knows, or both. Table material beside the
-- world, never world knowledge (the DM records what a handout teaches as knowledge); append-only.
CREATE TABLE ltw_handouts (
  campaign_id text NOT NULL CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  handout_id uuid NOT NULL,
  -- The character whose player it is for; null for the party.
  recipient_id text CHECK (recipient_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body text CHECK (body IS NULL OR char_length(body) BETWEEN 1 AND 2000),
  -- The entity whose approved picture it shows.
  entity_id text CHECK (entity_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  created_at timestamptz NOT NULL,
  position bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY (campaign_id, handout_id),
  CHECK (body IS NOT NULL OR entity_id IS NOT NULL)
);
CREATE INDEX ltw_handouts_recent ON ltw_handouts (campaign_id, position DESC);

CREATE TRIGGER ltw_handouts_append_only BEFORE UPDATE OR DELETE
  ON ltw_handouts FOR EACH ROW EXECUTE FUNCTION ltw_reject_history_rewrite();
CREATE TRIGGER ltw_handouts_no_truncate BEFORE TRUNCATE
  ON ltw_handouts FOR EACH STATEMENT EXECUTE FUNCTION ltw_reject_history_rewrite();
