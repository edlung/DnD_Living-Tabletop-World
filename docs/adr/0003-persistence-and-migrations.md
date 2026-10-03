# 0003. PostgreSQL access and forward-only SQL migrations

- Status: Accepted
- Date: 2026-10-03
- Stage: 0
- Decision type: technical
- Owner approval: not required (technical)

## Context

`ARCHITECTURE.md` → Persistence selects PostgreSQL for relational state, event/audit records, and knowledge relations. Stage 0 must provide migration infrastructure suitable for later domain work **without inventing the Stage 10 schema**. The persistence/replay contract (event ordering, atomicity, temporal domains) is a Stage 10 decision (`docs/IMPLEMENTATION_PREREQUISITES.md`), so Stage 0 must not lock in an ORM or data-access model that pre-empts it.

## Options considered

1. **ORM with generated migrations (Prisma, TypeORM, Drizzle Kit)** — fast CRUD, but imposes a data-access model before the World Kernel's event/audit design exists, and generated migrations hide the exact SQL that audit-sensitive schema needs.
2. **Query builder with its migrator (Kysely)** — good typed SQL, but still commits the access layer now.
3. **Migration library (node-pg-migrate, graphile-migrate)** — capable; adds a DSL or workflow conventions we do not need yet.
4. **Plain SQL files with a small in-repo runner on `pg`** — explicit SQL, no access-layer commitment, tiny surface, fully testable.

## Decision

Option 4.

- Driver: `pg` (node-postgres). The query/access layer is chosen in Stage 10 with the World Kernel persistence ADR.
- Migrations live in `apps/server/migrations/` as `NNNN_snake_case_name.sql`, forward-only. The runner is `apps/server/src/platform/db/` and runs with `pnpm db:migrate` (after `pnpm build`).
- History table `ltw_schema_migrations(id, checksum, applied_at)`. Applied history must be an exact prefix of the files on disk; edited (checksum drift), deleted, or reordered migrations stop the run.
- Each migration runs in its own transaction together with its history row; a failure rolls back both. A session advisory lock serializes concurrent runners.
- Statements that cannot run in a transaction (for example `CREATE INDEX CONCURRENTLY`) are unsupported until a later ADR adds an explicit opt-out.
- Stage 0 ships **no domain migrations**. Bootstrap creates only the history table.
- Local PostgreSQL 18 runs via `docker-compose.yml` (host port 54329); CI uses a PostgreSQL 18 service container. Integration tests create and drop a throwaway database per test, so they need a role allowed to `CREATE DATABASE`.
- Vector index and object storage (`ARCHITECTURE.md`) are deferred to the stages that introduce semantic memory and assets.

## Consequences

- Schema changes are reviewed as plain SQL, which suits audit and event tables.
- No rollback ("down") migrations: corrections are new forward migrations, consistent with history-preserving undo.
- Replacing the runner later (for example with a library) only needs to preserve the history table semantics.

## Invariants affected

None weakened. Supports invariants 11–12 (auditable, reconstructable history) by keeping schema evolution explicit and append-only.
