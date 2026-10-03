-- World Kernel event store (docs/adr/0006-temporal-model-and-undo.md,
-- docs/adr/0007-world-kernel-model-and-event-store.md).
-- One append-only, gapless event stream per campaign. History is never
-- updated or deleted; triggers enforce this below the application.

CREATE TABLE ltw_event_streams (
  stream_id text PRIMARY KEY,
  version bigint NOT NULL CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ltw_commands (
  command_id text PRIMARY KEY,
  stream_id text NOT NULL REFERENCES ltw_event_streams (stream_id),
  command_type text NOT NULL,
  actor jsonb NOT NULL,
  fingerprint text NOT NULL,
  command jsonb NOT NULL,
  reason text,
  first_sequence bigint NOT NULL CHECK (first_sequence >= 1),
  last_sequence bigint NOT NULL CHECK (last_sequence >= first_sequence),
  recorded_at timestamptz NOT NULL,
  UNIQUE (stream_id, first_sequence)
);

CREATE TABLE ltw_events (
  stream_id text NOT NULL REFERENCES ltw_event_streams (stream_id),
  sequence bigint NOT NULL CHECK (sequence >= 1),
  event_id uuid NOT NULL UNIQUE,
  event_type text NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version >= 1),
  payload jsonb NOT NULL,
  world_time bigint NOT NULL,
  recorded_at timestamptz NOT NULL,
  command_id text NOT NULL REFERENCES ltw_commands (command_id),
  command_type text NOT NULL,
  actor jsonb NOT NULL,
  PRIMARY KEY (stream_id, sequence)
);

CREATE FUNCTION ltw_reject_history_rewrite() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ltw history is append-only: % on % is not allowed', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER ltw_events_append_only
  BEFORE UPDATE OR DELETE ON ltw_events
  FOR EACH ROW EXECUTE FUNCTION ltw_reject_history_rewrite();
CREATE TRIGGER ltw_events_no_truncate
  BEFORE TRUNCATE ON ltw_events
  FOR EACH STATEMENT EXECUTE FUNCTION ltw_reject_history_rewrite();

CREATE TRIGGER ltw_commands_append_only
  BEFORE UPDATE OR DELETE ON ltw_commands
  FOR EACH ROW EXECUTE FUNCTION ltw_reject_history_rewrite();
CREATE TRIGGER ltw_commands_no_truncate
  BEFORE TRUNCATE ON ltw_commands
  FOR EACH STATEMENT EXECUTE FUNCTION ltw_reject_history_rewrite();

-- Stream heads may advance (optimistic concurrency) but never disappear.
CREATE TRIGGER ltw_event_streams_no_delete
  BEFORE DELETE ON ltw_event_streams
  FOR EACH ROW EXECUTE FUNCTION ltw_reject_history_rewrite();
CREATE TRIGGER ltw_event_streams_no_truncate
  BEFORE TRUNCATE ON ltw_event_streams
  FOR EACH STATEMENT EXECUTE FUNCTION ltw_reject_history_rewrite();

CREATE FUNCTION ltw_stream_head_forward_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stream_id <> OLD.stream_id OR NEW.version <= OLD.version THEN
    RAISE EXCEPTION 'ltw stream heads only move forward' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ltw_event_streams_forward_only
  BEFORE UPDATE ON ltw_event_streams
  FOR EACH ROW EXECUTE FUNCTION ltw_stream_head_forward_only();
