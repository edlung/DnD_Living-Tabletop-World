-- Operator settlements of orphaned image reservations (docs/adr/0035-images.md, amendment
-- 2026-10-16; apps/server/src/images/AGENTS.md). A job that stopped between its reservation and its
-- settlement (a crash, a killed process; the restarted worker runs the job again under a new
-- reservation) leaves its reservation open, counted whole against the ceiling. Only
-- `pnpm ai:operator image-reservation-settle` closes one: a settlement with the outcome `orphaned`,
-- at the whole reservation unless the operator records the amount the provider's own records show,
-- and beside it the owner's authorization, in one transaction. Append-only like the rest of the
-- image ledger (migration 0011).

ALTER TABLE ltw_image_settlements
  DROP CONSTRAINT ltw_image_settlements_outcome_check,
  ADD CONSTRAINT ltw_image_settlements_outcome_check CHECK (
    outcome IN ('generated', 'refused', 'failed', 'timeout', 'not-sent', 'orphaned')
  ),
  -- The operator's amount is never the provider's report, and no answer is known.
  ADD CONSTRAINT ltw_image_settlements_orphaned_check CHECK (
    outcome <> 'orphaned'
    OR (NOT cost_reported AND returned_model IS NULL AND provider_request_id IS NULL)
  );

-- The owner's recorded authorization of each operator settlement.
CREATE TABLE ltw_image_operator_settlements (
  charge_id uuid PRIMARY KEY REFERENCES ltw_image_settlements (charge_id),
  owner_id text NOT NULL CHECK (char_length(owner_id) BETWEEN 1 AND 200),
  authorized_on date NOT NULL,
  authorization_source text NOT NULL CHECK (char_length(authorization_source) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- An authorization belongs to an orphaned settlement only.
CREATE FUNCTION ltw_image_operator_settlement_is_orphaned() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM ltw_image_settlements
    WHERE charge_id = NEW.charge_id AND outcome = 'orphaned'
  ) THEN
    RAISE EXCEPTION 'an operator settlement authorizes an orphaned image settlement only'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ltw_image_operator_settlements_orphaned BEFORE INSERT
  ON ltw_image_operator_settlements FOR EACH ROW
  EXECUTE FUNCTION ltw_image_operator_settlement_is_orphaned();

-- No orphaned settlement commits without the owner's authorization beside it.
CREATE FUNCTION ltw_image_orphaned_settlement_is_authorized() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM ltw_image_operator_settlements WHERE charge_id = NEW.charge_id
  ) THEN
    RAISE EXCEPTION 'an orphaned image settlement needs the owner''s recorded authorization'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ltw_image_orphaned_settlements_authorized
  AFTER INSERT ON ltw_image_settlements
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW.outcome = 'orphaned')
  EXECUTE FUNCTION ltw_image_orphaned_settlement_is_authorized();

CREATE TRIGGER ltw_image_operator_settlements_append_only BEFORE UPDATE OR DELETE
  ON ltw_image_operator_settlements FOR EACH ROW EXECUTE FUNCTION ltw_reject_history_rewrite();
CREATE TRIGGER ltw_image_operator_settlements_no_truncate BEFORE TRUNCATE
  ON ltw_image_operator_settlements FOR EACH STATEMENT EXECUTE FUNCTION ltw_reject_history_rewrite();
