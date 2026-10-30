-- Stage 380: explicit monetary policy, separate from historical numeric ceilings.
-- The operator's recorded authorization is required. No environment/default
-- value grants unlimited spending, and finite rows/history are never rewritten.
CREATE TABLE ltw_ai_text_policies (
  account_id text NOT NULL REFERENCES ltw_ai_billing_accounts (account_id),
  revision integer NOT NULL CHECK (revision >= 1),
  mode text NOT NULL CHECK (mode IN ('FINITE', 'UNLIMITED')),
  owner_id text NOT NULL CHECK (char_length(owner_id) BETWEEN 1 AND 200),
  authorized_on date NOT NULL,
  authorization_source text NOT NULL CHECK (char_length(authorization_source) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (account_id, revision)
);

-- Images currently have one installation-wide ledger (migration 0011), so their
-- explicit policy has the same scope. A later per-owner ledger must migrate both
-- the charge attribution and this authorization rather than infer owner identity.
CREATE TABLE ltw_image_policies (
  revision integer PRIMARY KEY CHECK (revision >= 1),
  mode text NOT NULL CHECK (mode IN ('FINITE', 'UNLIMITED')),
  owner_id text NOT NULL CHECK (char_length(owner_id) BETWEEN 1 AND 200),
  authorized_on date NOT NULL,
  authorization_source text NOT NULL CHECK (char_length(authorization_source) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Each new reservation identifies the exact policy used for admission. Null
-- preserves the meaning and readability of every earlier reservation.
ALTER TABLE ltw_ai_attempts ADD COLUMN monetary_policy_revision integer;
ALTER TABLE ltw_ai_attempts ADD CONSTRAINT ltw_ai_attempt_monetary_policy_fk
  FOREIGN KEY (account_id, monetary_policy_revision)
  REFERENCES ltw_ai_text_policies (account_id, revision);
ALTER TABLE ltw_image_charges ADD COLUMN monetary_policy_revision integer
  REFERENCES ltw_image_policies (revision);

CREATE TRIGGER ltw_ai_text_policies_append_only BEFORE UPDATE OR DELETE
  ON ltw_ai_text_policies FOR EACH ROW EXECUTE FUNCTION ltw_reject_history_rewrite();
CREATE TRIGGER ltw_ai_text_policies_no_truncate BEFORE TRUNCATE
  ON ltw_ai_text_policies FOR EACH STATEMENT EXECUTE FUNCTION ltw_reject_history_rewrite();
CREATE TRIGGER ltw_image_policies_append_only BEFORE UPDATE OR DELETE
  ON ltw_image_policies FOR EACH ROW EXECUTE FUNCTION ltw_reject_history_rewrite();
CREATE TRIGGER ltw_image_policies_no_truncate BEFORE TRUNCATE
  ON ltw_image_policies FOR EACH STATEMENT EXECUTE FUNCTION ltw_reject_history_rewrite();
