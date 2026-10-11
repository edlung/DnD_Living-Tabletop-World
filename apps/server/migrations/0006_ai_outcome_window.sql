-- Live caller outcomes commit only inside their finalizer window (docs/adr/0032-live-ai.md,
-- amendment 2026-10-11, repair 2; docs/STAGE_300_REMEDIATION_DESIGN.md §2): database
-- clock_timestamp() at most the stored caller deadline plus 5 seconds (FINALIZER_GRACE_MS in
-- request-journal.ts). The check is a deferred constraint trigger, so it runs again while the
-- transaction commits: a late write or a late COMMIT aborts the whole transaction, outcome and
-- trace together, and recovery stays possible. Recovered outcomes are not affected.

CREATE FUNCTION ltw_ai_live_outcome_in_window() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind = 'live' AND NOT EXISTS (
    SELECT 1 FROM ltw_ai_requests r
    WHERE r.request_id = NEW.request_id
      AND clock_timestamp() <= r.deadline_at + interval '5 seconds'
  ) THEN
    RAISE EXCEPTION 'ltw live caller outcome outside its finalizer window'
      USING ERRCODE = 'LT001';
  END IF;
  RETURN NULL;
END;
$$;

-- Immediate on insert, and deferred to commit (the default mode).
CREATE TRIGGER ltw_ai_request_outcomes_live_window_insert
  AFTER INSERT ON ltw_ai_request_outcomes
  FOR EACH ROW EXECUTE FUNCTION ltw_ai_live_outcome_in_window();
CREATE CONSTRAINT TRIGGER ltw_ai_request_outcomes_live_window_commit
  AFTER INSERT ON ltw_ai_request_outcomes
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ltw_ai_live_outcome_in_window();
