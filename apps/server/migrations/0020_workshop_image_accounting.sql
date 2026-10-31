-- Stage420: image spending belongs to a real campaign OR a real workshop claim.
ALTER TABLE ltw_image_charges ALTER COLUMN campaign_id DROP NOT NULL;
ALTER TABLE ltw_image_charges
  ADD COLUMN workshop_owner_id uuid,
  ADD COLUMN workshop_draft_id uuid,
  ADD COLUMN workshop_job_id uuid,
  ADD COLUMN workshop_auth_session_id uuid,
  ADD COLUMN workshop_worker_id uuid,
  ADD COLUMN workshop_fence bigint;
ALTER TABLE ltw_image_charges ADD CONSTRAINT ltw_image_charge_subject CHECK (
  (campaign_id IS NOT NULL AND workshop_owner_id IS NULL AND workshop_draft_id IS NULL
    AND workshop_job_id IS NULL AND workshop_auth_session_id IS NULL
    AND workshop_worker_id IS NULL AND workshop_fence IS NULL)
  OR
  (campaign_id IS NULL AND workshop_owner_id IS NOT NULL AND workshop_draft_id IS NOT NULL
    AND workshop_job_id IS NOT NULL AND workshop_auth_session_id IS NOT NULL
    AND workshop_worker_id IS NOT NULL AND workshop_fence IS NOT NULL AND workshop_fence > 0)
);
ALTER TABLE ltw_image_charges ADD CONSTRAINT ltw_image_charge_workshop_job
  FOREIGN KEY (workshop_job_id,workshop_owner_id,workshop_draft_id,workshop_auth_session_id)
  REFERENCES ltw_workshop_image_jobs (job_id,owner_id,draft_id,auth_session_id);
CREATE UNIQUE INDEX ltw_image_charge_workshop_claim
  ON ltw_image_charges (workshop_job_id,workshop_fence) WHERE workshop_job_id IS NOT NULL;
CREATE INDEX ltw_image_charge_workshop_owner ON ltw_image_charges
  (workshop_owner_id,workshop_draft_id,workshop_job_id);
