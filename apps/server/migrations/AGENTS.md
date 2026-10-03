# Migrations

Forward-only PostgreSQL migrations applied by `pnpm db:migrate`
(runner: `apps/server/src/platform/db/`; decision: `docs/adr/0003-persistence-and-migrations.md`).

- Name files `NNNN_snake_case_name.sql`; versions are strictly increasing four-digit numbers.
- Never edit, rename, reorder, or delete a migration once it may have been applied; the runner rejects checksum or history drift. Add a new migration instead.
- Each file runs in one transaction with its history record. Statements that cannot run in a transaction need an ADR first.
- Schema follows the authorized stage only. Stage 0 ships no domain schema; the World Kernel schema starts in Stage 10.
- Read only the migrations relevant to the task; do not load this directory wholesale once it grows.
