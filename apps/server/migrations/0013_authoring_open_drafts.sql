-- The DM's open drafts (owner decisions 11, SI-D1; docs/adr/0018-ai-authoring.md amendment
-- 2026-10-28). Additive: an index for reading the latest revision of each proposal, and closing
-- revisions for drafts that were open before drafts could be restored.

-- The list reads each proposal's latest revision of one campaign.
CREATE INDEX ltw_authoring_revisions_latest
  ON ltw_authoring_revisions (campaign_id, proposal_id, revision DESC);

-- Before this release a DM's "Cancel" was the screen's alone, so every draft still open now was
-- either discarded or abandoned, and was never restorable: each is closed with a cancelled
-- revision, so a reload does not bring them back one by one. A committed proposal (its
-- `authoring.<proposal_id>` command exists) is never touched; one already closed neither, so
-- running this statement again changes nothing.
INSERT INTO ltw_authoring_revisions
  (proposal_id, revision, campaign_id, created_by, revision_doc, created_at)
SELECT
  latest.proposal_id,
  latest.revision + 1,
  latest.campaign_id,
  'migration:0013',
  latest.revision_doc || jsonb_build_object(
    'revision', latest.revision + 1,
    'cancelled', true,
    'createdBy', 'migration:0013',
    'createdAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ),
  now()
FROM (
  SELECT DISTINCT ON (proposal_id) proposal_id, revision, campaign_id, revision_doc
    FROM ltw_authoring_revisions
   ORDER BY proposal_id, revision DESC
) AS latest
WHERE coalesce(latest.revision_doc ->> 'cancelled', 'false') <> 'true'
  AND NOT EXISTS (
    SELECT 1 FROM ltw_commands AS command
     WHERE command.command_id = 'authoring.' || latest.proposal_id
  );
