-- Campaign moves (Stage 697a, docs/adr/0061-local-mode.md §5): a campaign exported for a move is
-- away, played on another server, until a package brings it home or the move is cancelled. While
-- it is away its history takes no appends and its membership no new seats or invitations: the
-- triggers below refuse them under the application (the HTTP layer answers 409 first). A move is
-- one-way: it ends once, as returned or cancelled, and is never deleted. Additive: an older build
-- never reads the table, and its appends to a campaign that never moved pass as before.

CREATE TABLE ltw_campaign_moves (
  move_id uuid PRIMARY KEY,
  campaign_id text NOT NULL CHECK (campaign_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  -- Where it is played meanwhile, in the operator's words (a computer's or a server's name).
  destination text NOT NULL CHECK (char_length(destination) BETWEEN 1 AND 80),
  moved_at timestamptz NOT NULL,
  ended_at timestamptz,
  ended_as text CHECK (ended_as IN ('returned', 'cancelled')),
  CHECK ((ended_at IS NULL) = (ended_as IS NULL)),
  CHECK (ended_at IS NULL OR ended_at >= moved_at)
);
-- One open move a campaign.
CREATE UNIQUE INDEX ltw_campaign_moves_away ON ltw_campaign_moves (campaign_id)
  WHERE ended_at IS NULL;

CREATE FUNCTION ltw_campaign_moves_one_way() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.ended_at IS NOT NULL
     OR NEW.move_id <> OLD.move_id OR NEW.campaign_id <> OLD.campaign_id
     OR NEW.destination <> OLD.destination OR NEW.moved_at <> OLD.moved_at THEN
    RAISE EXCEPTION 'ltw campaign moves end once and are kept' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ltw_campaign_moves_one_way
  BEFORE UPDATE OR DELETE ON ltw_campaign_moves
  FOR EACH ROW EXECUTE FUNCTION ltw_campaign_moves_one_way();
CREATE TRIGGER ltw_campaign_moves_no_truncate
  BEFORE TRUNCATE ON ltw_campaign_moves
  FOR EACH STATEMENT EXECUTE FUNCTION ltw_reject_history_rewrite();

-- The history's tables name the campaign as their stream.
CREATE FUNCTION ltw_refuse_away_history() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM ltw_campaign_moves WHERE campaign_id = NEW.stream_id AND ended_at IS NULL) THEN
    RAISE EXCEPTION 'ltw campaign % is away: its history takes no appends here', NEW.stream_id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ltw_event_streams_not_away
  BEFORE INSERT OR UPDATE ON ltw_event_streams
  FOR EACH ROW EXECUTE FUNCTION ltw_refuse_away_history();
CREATE TRIGGER ltw_commands_not_away
  BEFORE INSERT ON ltw_commands
  FOR EACH ROW EXECUTE FUNCTION ltw_refuse_away_history();
CREATE TRIGGER ltw_events_not_away
  BEFORE INSERT ON ltw_events
  FOR EACH ROW EXECUTE FUNCTION ltw_refuse_away_history();

CREATE FUNCTION ltw_refuse_away_membership() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM ltw_campaign_moves WHERE campaign_id = NEW.campaign_id AND ended_at IS NULL) THEN
    RAISE EXCEPTION 'ltw campaign % is away: it takes no new members here', NEW.campaign_id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ltw_account_seats_not_away
  BEFORE INSERT ON ltw_account_seats
  FOR EACH ROW EXECUTE FUNCTION ltw_refuse_away_membership();
CREATE TRIGGER ltw_auth_invitations_not_away
  BEFORE INSERT ON ltw_auth_invitations
  FOR EACH ROW EXECUTE FUNCTION ltw_refuse_away_membership();
