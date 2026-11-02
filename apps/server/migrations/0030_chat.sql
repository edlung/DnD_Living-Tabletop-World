-- Table talk (docs/adr/0044-online-play.md, Stage 630): the table's chat, whispers to the DM and the
-- DM's word to one player. Table talk beside the world, never world knowledge; append-only.
CREATE TABLE ltw_chat_messages (
  campaign_id text NOT NULL CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  message_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('table', 'dm', 'player')),
  voice text NOT NULL CHECK (voice IN ('in-character', 'out-of-character')),
  -- The speaker: a player's character, or null for the DM.
  speaker_id text CHECK (speaker_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$'),
  -- The character whose player a DM's message goes to (channel 'player' only).
  recipient_id text CHECK (recipient_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$'),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL,
  position bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY (campaign_id, message_id),
  CHECK ((channel = 'player') = (recipient_id IS NOT NULL)),
  CHECK (channel <> 'dm' OR speaker_id IS NOT NULL),
  CHECK (channel <> 'player' OR speaker_id IS NULL)
);
CREATE INDEX ltw_chat_messages_recent ON ltw_chat_messages (campaign_id, position DESC);

CREATE FUNCTION ltw_chat_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ltw chat messages are append-only' USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER ltw_chat_messages_append_only
  BEFORE UPDATE OR DELETE ON ltw_chat_messages
  FOR EACH ROW EXECUTE FUNCTION ltw_chat_append_only();
