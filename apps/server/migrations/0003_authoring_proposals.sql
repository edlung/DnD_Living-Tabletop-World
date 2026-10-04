-- Authoring proposal revisions (docs/adr/0018-ai-authoring.md §5, §9).
-- DM working data, not canonical state: each edit appends a revision.
-- Whether a proposal was committed or undone is canonical (the
-- `authoring.<proposal_id>` command and its undo), never stored here.

CREATE TABLE ltw_authoring_revisions (
  proposal_id text NOT NULL,
  revision integer NOT NULL CHECK (revision >= 1),
  campaign_id text NOT NULL,
  created_by text NOT NULL,
  revision_doc jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (proposal_id, revision)
);

CREATE INDEX ltw_authoring_revisions_by_campaign
  ON ltw_authoring_revisions (campaign_id, proposal_id);

CREATE TRIGGER ltw_authoring_revisions_append_only
  BEFORE UPDATE OR DELETE ON ltw_authoring_revisions
  FOR EACH ROW EXECUTE FUNCTION ltw_reject_history_rewrite();
CREATE TRIGGER ltw_authoring_revisions_no_truncate
  BEFORE TRUNCATE ON ltw_authoring_revisions
  FOR EACH STATEMENT EXECUTE FUNCTION ltw_reject_history_rewrite();
