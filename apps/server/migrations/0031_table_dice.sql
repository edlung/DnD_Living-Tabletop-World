-- The players' own dice and a roll between the DM and one player (Stage 630,
-- docs/adr/0044-online-play.md §4). Additive: an older build ignores the columns and the table
-- (it shows an entered roll as an ordinary one, and a private roll to the whole table).

-- A roll whose faces a player read off their own dice (the server still computed every total), and
-- the one character who sees a roll besides the DM.
ALTER TABLE ltw_table_rolls ADD COLUMN entered boolean NOT NULL DEFAULT false;
ALTER TABLE ltw_table_rolls ADD COLUMN audience_id text
  CHECK (audience_id IS NULL OR audience_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$');

-- A check the DM asks in private: its answer is the DM's and that player's only.
ALTER TABLE ltw_check_requests ADD COLUMN is_private boolean NOT NULL DEFAULT false;

-- The DM's word that an entered roll is what the dice showed. Append-only.
CREATE TABLE ltw_roll_confirmations (
  campaign_id text NOT NULL,
  roll_id uuid NOT NULL,
  confirmed_at timestamptz NOT NULL,
  PRIMARY KEY (campaign_id, roll_id),
  FOREIGN KEY (campaign_id, roll_id) REFERENCES ltw_table_rolls (campaign_id, roll_id)
);
CREATE TRIGGER ltw_roll_confirmations_append_only BEFORE UPDATE OR DELETE
  ON ltw_roll_confirmations FOR EACH ROW EXECUTE FUNCTION ltw_reject_history_rewrite();
CREATE TRIGGER ltw_roll_confirmations_no_truncate BEFORE TRUNCATE
  ON ltw_roll_confirmations FOR EACH STATEMENT EXECUTE FUNCTION ltw_reject_history_rewrite();

-- The campaign's dice: the app's (the default), or the players' own with their faces entered.
ALTER TABLE ltw_table_states ADD COLUMN dice text NOT NULL DEFAULT 'app'
  CHECK (dice IN ('app', 'physical'));
