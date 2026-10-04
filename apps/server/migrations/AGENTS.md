# Migrations

Forward-only PostgreSQL migrations applied by `pnpm db:migrate`
(runner: `apps/server/src/platform/db/`; decision: `docs/adr/0003-persistence-and-migrations.md`).

- Name files `NNNN_snake_case_name.sql`; versions are strictly increasing four-digit numbers.
- Never edit, rename, reorder, or delete a migration once it may have been applied; the runner rejects checksum or history drift. Add a new migration instead.
- Each file runs in one transaction with its history record. Statements that cannot run in a transaction need an ADR first.
- Schema follows the authorized stage only. `0001_world_event_store.sql` (Stage 10) is the append-only campaign event store; later domains append to it rather than adding mutable state tables, unless an ADR says otherwise. `0002_ai_traces.sql` (Stage 100, ADR 0017) holds append-only AI request traces, and `0003_authoring_proposals.sql` (Stage 110, ADR 0018) append-only authoring proposal revisions: DM data, not canonical state.
- Read only the migrations relevant to the task; do not load this directory wholesale once it grows.
