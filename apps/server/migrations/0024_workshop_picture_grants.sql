-- Gate 07 (G07-02): paid workshop pictures need a per-owner grant, as text preparation does
-- (`ltw_ai_preparation_grants`). Revisions are append-only; the latest one decides. Owners whose
-- latest text grant was enabled keep pictures (owner disposition, 2026-10-31). Additive: an
-- earlier image never reads this table (and so would not enforce it after a rollback).
CREATE TABLE ltw_workshop_picture_grants (
  owner_id uuid NOT NULL REFERENCES ltw_workshop_owners (owner_id),
  revision integer NOT NULL CHECK (revision > 0),
  enabled boolean NOT NULL,
  authorized_by text NOT NULL,
  authorized_on date NOT NULL,
  authorization_source text NOT NULL CHECK (length(authorization_source) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, revision)
);
CREATE TRIGGER ltw_workshop_picture_grants_append_only BEFORE UPDATE OR DELETE
  ON ltw_workshop_picture_grants FOR EACH ROW EXECUTE FUNCTION ltw_reject_history_rewrite();
CREATE TRIGGER ltw_workshop_picture_grants_no_truncate BEFORE TRUNCATE
  ON ltw_workshop_picture_grants FOR EACH STATEMENT EXECUTE FUNCTION ltw_reject_history_rewrite();

INSERT INTO ltw_workshop_picture_grants
  (owner_id, revision, enabled, authorized_by, authorized_on, authorization_source)
SELECT DISTINCT ON (latest.owner_id) latest.owner_id, 1, true, latest.authorized_by, CURRENT_DATE,
  'reviews/OWNER_GATE_07_DISPOSITION_2026-10-31.json: an owner with an enabled text grant keeps pictures'
FROM (
  SELECT DISTINCT ON (approval_id, owner_id) owner_id, enabled, authorized_by, created_at
  FROM ltw_ai_preparation_grants
  ORDER BY approval_id, owner_id, revision DESC
) latest
WHERE latest.enabled
ORDER BY latest.owner_id, latest.created_at DESC;
