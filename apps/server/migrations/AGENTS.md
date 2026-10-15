# Migrations

Forward-only PostgreSQL migrations applied by `pnpm db:migrate`
(runner: `apps/server/src/platform/db/`; decision: `docs/adr/0003-persistence-and-migrations.md`).

- Name files `NNNN_snake_case_name.sql`; versions are strictly increasing four-digit numbers.
- Never edit, rename, reorder, or delete a migration once it may have been applied; the runner rejects checksum or history drift. Add a new migration instead.
- Each file runs in one transaction with its history record. Statements that cannot run in a transaction need an ADR first.
- Schema follows the authorized stage only. `0001_world_event_store.sql` (Stage 10) is the append-only campaign event store; later domains append to it rather than adding mutable state tables, unless an ADR says otherwise. `0002_ai_traces.sql` (Stage 100, ADR 0017) holds append-only AI request traces, `0003_authoring_proposals.sql` (Stage 110, ADR 0018) append-only authoring proposal revisions: DM data, not canonical state; `0004_asset_contents.sql` (Stage 150, ADR 0022 §6) append-only generated image bytes by content hash, plus an index for the asset worker; and `0005_ai_accounting.sql` (Stage 300 remediation, ADR 0032 amendment 2026-10-11) append-only AI spending operator records and accounting journal (`src/ai/accounting/AGENTS.md`); `0006_ai_outcome_window.sql` (same ADR, repair 2) a trigger that lets a live caller outcome commit only inside its finalizer window; `0007_ai_outcome_code.sql` (same ADR, checkpoint B2) the fallback outcome code of a live caller outcome; `0008_ai_attempt_responses.sql` (same ADR, B2 repair 1) the provider request ID of an admitted attempt; `0009_dm_substitutions.sql` (Stage 310, ADR 0033 §6) the DM's append-only reasons for acting for a player's character: DM data, descriptive, not canonical (`src/dm/AGENTS.md`).
- Read only the migrations relevant to the task; do not load this directory wholesale once it grows.
