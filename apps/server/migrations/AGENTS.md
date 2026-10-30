# Migrations

Stage 380 (owner-accepted ADR 0038): `0014_ai_unlimited_policy.sql` adds immutable
text-account and image monetary-policy revisions and reservation references;
`0015_workshop_access.sql` adds separate owners, hashed invitation/session
credentials, revocation evidence and private draft metadata. No campaign
membership or played state is stored in workshop tables. Keep ownership immutable;
Stage 390 package revisions will reference these containers rather than rewrite them.

Stage420: `0019_workshop_images.sql` adds private draft-image jobs, immutable
dispatches/candidates/bytes and chosen visual manifests; `0020_workshop_image_accounting.sql`
adds genuine nullable-campaign workshop image charges. New revision writers must
atomically create manifest version0. After these subjects/manifests exist, recovery
requires an0019/0020-aware app/operator build (`deploy/RUNBOOK.md`§3); the ordinary
older-image event-readiness check does not establish compatibility.

Forward-only PostgreSQL migrations applied by `pnpm db:migrate`
(runner: `apps/server/src/platform/db/`; decision: `docs/adr/0003-persistence-and-migrations.md`).

- Name files `NNNN_snake_case_name.sql`; versions are strictly increasing four-digit numbers.
- Never edit, rename, reorder, or delete a migration once it may have been applied; the runner rejects checksum or history drift. Add a new migration instead.
- Each file runs in one transaction with its history record. Statements that cannot run in a transaction need an ADR first.
- Schema follows the authorized stage only. `0001_world_event_store.sql` (Stage 10) is the append-only campaign event store; later domains append to it rather than adding mutable state tables, unless an ADR says otherwise. `0002_ai_traces.sql` (Stage 100, ADR 0017) holds append-only AI request traces, `0003_authoring_proposals.sql` (Stage 110, ADR 0018) append-only authoring proposal revisions: DM data, not canonical state; `0004_asset_contents.sql` (Stage 150, ADR 0022 §6) append-only generated image bytes by content hash, plus an index for the asset worker; and `0005_ai_accounting.sql` (Stage 300 remediation, ADR 0032 amendment 2026-10-11) append-only AI spending operator records and accounting journal (`src/ai/accounting/AGENTS.md`); `0006_ai_outcome_window.sql` (same ADR, repair 2) a trigger that lets a live caller outcome commit only inside its finalizer window; `0007_ai_outcome_code.sql` (same ADR, checkpoint B2) the fallback outcome code of a live caller outcome; `0008_ai_attempt_responses.sql` (same ADR, B2 repair 1) the provider request ID of an admitted attempt; `0009_dm_substitutions.sql` (Stage 310, ADR 0033 §6) the DM's append-only reasons for acting for a player's character: DM data, descriptive, not canonical (`src/dm/AGENTS.md`); `0010_auth.sql` (Stage 340, ADR 0036) sign-in credentials by hash only: invitations and sessions whose used/revoked/last-seen columns change one way (triggers), and pruned redeem evidence; credentials, not canonical state (`src/auth/AGENTS.md`); `0011_image_budget.sql` (Stage 330, ADR 0035 §2) the append-only image ledger: ceiling revisions with the owner's authorization, reservations and settlements (`src/images/AGENTS.md`); `0012_image_orphaned_settlements.sql` (same ADR, amendment 2026-10-16) the operator's settlement of an orphaned image reservation (outcome `orphaned`) with the owner's authorization beside it, each requiring the other; `0013_authoring_open_drafts.sql` (owner decisions 11, ADR 0018 amendment 2026-10-28) an index for each proposal's latest revision and cancelled closing revisions for the drafts open before drafts could be restored.
- Migrations must stay additive so that a deployment rollback can run the previous image on the same database (ADR 0037; `migrate-cli --allow-newer-database`, used only by `deploy/scripts/deploy.sh --rollback`). A change an earlier image cannot run beside needs a restore instead: say so in the stage's report and the runbook.
- Read only the migrations relevant to the task; do not load this directory wholesale once it grows.
