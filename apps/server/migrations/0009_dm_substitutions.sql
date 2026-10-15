-- The DM's reasons for acting for a player's character (docs/adr/0033-live-session.md §6;
-- docs/STAGE_310_DESIGN.md §B). DM data, descriptive, not canonical state: the stored command
-- with the DM as issuer is the canonical record, and a reason whose command was never stored
-- describes nothing. One reason per command ID within a campaign, recorded before the DM
-- submits that command; append-only like the event store.

CREATE TABLE ltw_dm_substitutions (
  campaign_id text NOT NULL CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  command_id text NOT NULL
    CHECK (char_length(command_id) <= 300 AND command_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]*$'),
  character_id text NOT NULL CHECK (character_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  reason text NOT NULL CHECK (reason IN ('absent', 'asked', 'other')),
  note text CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (campaign_id, command_id)
);

CREATE TRIGGER ltw_dm_substitutions_append_only BEFORE UPDATE OR DELETE
  ON ltw_dm_substitutions FOR EACH ROW EXECUTE FUNCTION ltw_reject_history_rewrite();
CREATE TRIGGER ltw_dm_substitutions_no_truncate BEFORE TRUNCATE
  ON ltw_dm_substitutions FOR EACH STATEMENT EXECUTE FUNCTION ltw_reject_history_rewrite();
