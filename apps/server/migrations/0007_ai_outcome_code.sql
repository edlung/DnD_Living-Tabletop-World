-- The fallback outcome code of a live caller outcome (docs/adr/0032-live-ai.md, B2;
-- docs/STAGE_300_REMEDIATION_DESIGN.md §2-3): the fixed code that decided the frozen result
-- (for example PROVIDER_REFUSAL, BUDGET_DENIED, NO_PROPOSAL, CALLER_CANCELLED), null for a valid
-- result and for every recovered outcome. Additive: the table stays append-only (migration 0005),
-- and rows written before this migration keep a null code, meaning not recorded.

ALTER TABLE ltw_ai_request_outcomes
  ADD COLUMN code text CHECK (code IS NULL OR code ~ '^[A-Z][A-Z_]{1,63}$'),
  ADD CONSTRAINT ltw_ai_request_outcomes_recovered_no_code
    CHECK (kind <> 'recovered_incomplete' OR code IS NULL);
