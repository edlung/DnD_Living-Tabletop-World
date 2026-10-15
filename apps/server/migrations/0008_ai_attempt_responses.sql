-- The provider's request/message ID of an admitted attempt (docs/adr/0032-live-ai.md, B2 repair 1;
-- docs/STAGE_300_REMEDIATION_DESIGN.md §2: "Store provider request/message IDs when available"),
-- recorded for every attempt whose response carried one: settled, without usage, or suspect.
-- At most one per attempt, with the model the response reported. Additive and append-only like
-- migration 0005; it holds no charge and changes no accounting.

CREATE TABLE ltw_ai_attempt_responses (
  attempt_id uuid PRIMARY KEY REFERENCES ltw_ai_attempts,
  provider_request_id text NOT NULL
    CHECK (provider_request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'),
  returned_model text
    CHECK (returned_model IS NULL OR returned_model ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TRIGGER ltw_ai_attempt_responses_append_only BEFORE UPDATE OR DELETE
  ON ltw_ai_attempt_responses FOR EACH ROW EXECUTE FUNCTION ltw_reject_history_rewrite();
CREATE TRIGGER ltw_ai_attempt_responses_no_truncate BEFORE TRUNCATE
  ON ltw_ai_attempt_responses FOR EACH STATEMENT EXECUTE FUNCTION ltw_reject_history_rewrite();
