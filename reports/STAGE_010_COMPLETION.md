# Stage 10 Completion Report — World Kernel

- Work order: `work-orders/OPUS_STAGE_010.md`
- Builder: Claude Opus 5.5 (matrix: HIGH; this session ran at a higher effort setting, scope unchanged)
- Implementation revision: `3b4bd708e8ed361e08edf7fcbbf2c49c8b326596` (branch `main`; this report is committed on top of it)
- Formal gate: none at Stage 10 (no Astra handoff required)
- Status: **COMPLETE — awaiting owner authorization for Stage 20**

The owner first asked to start Stage 20, then chose to run Stage 10 first because Stage 20 depends on the kernel.

## Decisions

| ADR                                                            | Decision                                                                                                         | Approval                                                                                          |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [0006](../docs/adr/0006-temporal-model-and-undo.md)            | Temporal model, canonical history, undo (product semantics required by `docs/IMPLEMENTATION_PREREQUISITES.md`)   | Approved as written by the project owner on 2026-10-03, before persistence/replay was implemented |
| [0007](../docs/adr/0007-world-kernel-model-and-event-store.md) | Kernel model, command pipeline, PostgreSQL event store; raw `pg` (closes ADR 0003's deferred data-access choice) | Technical                                                                                         |

## Delivered

- **Contracts** (`packages/contracts/src/kernel/`): strict command schemas (unknown fields rejected), result and rejection codes, ID and world-time schemas.
- **Kernel** (`packages/domain/src/kernel/`): Campaign, World (name and clock), WorldEntity (locations included), Location hierarchy, Scene, WorldClock, WorldState.
  - Pure deciders for 9 commands.
  - Fold and replay with corrupt-history detection.
  - Fact footprints and selective, history-preserving undo.
  - `WorldEngine` with this pipeline: schema → idempotency → ID resolution → authorization (DM/system, before any state is inspected) → `expectedVersion` → decide → stamp → atomic append. Optimistic retries use jittered backoff.
  - Projections: audit trail, world view at a world time under current canon, integrity checker.
- **Persistence** (`apps/server/src/world-engine/`, migration `0001_world_event_store.sql`): an append-only campaign stream.
  - DB triggers forbid update, delete, and truncate of history, and forbid moving a stream head backward.
  - Rows are validated against the domain schemas when loaded.
  - Idempotent `pnpm seed:ravenford`.
- **Fixture**: `fixtures/ravenford/kernel-seed.json`, public content only. Includes Thorne's backdated arrival.
- **Docs**: ADRs 0006/0007, `packages/domain/src/kernel/AGENTS.md`, updated context map, server and fixture `AGENTS.md`, README, and a pointer from `docs/IMPLEMENTATION_PREREQUISITES.md` to ADR 0006.

## Validation gate evidence

| Gate item                 | Evidence (tests)                                                                                                                                                                                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stable identity           | Identity kept across rename, move, and death; IDs never reused after undo; Orin is the same entity on Day 1 and Day 2 (`entities.test.ts`, `undo.test.ts`, `ravenford-fixture.test.ts`)                                                                                                             |
| Deterministic replay      | 5 seeded randomized runs × 250 commands. Replay equals live state at every version, after a JSON round trip through the schemas, and in a fresh engine (`replay.test.ts`). PostgreSQL history and state are identical to the in-memory run and survive restart (`world-engine.integration.test.ts`) |
| Event ordering            | Gapless sequences, contiguous command events, effective world time never decreases; in-memory and two-process PostgreSQL contention with conflicts actually occurring; same-command-ID race recorded once                                                                                           |
| Invalid-command rejection | Schema, authorization, and domain rejections, including temporal conflicts. No state, event, or command row is written on rejection (in memory and on PostgreSQL)                                                                                                                                   |
| Auditability              | Every event carries command, actor, recorded time, and world time; reasons are joined from command records; undo is marked and linked; the database refuses history rewrites                                                                                                                        |

## Commands and results (local: Node 25.8.1, pnpm 11.11.0, PostgreSQL 18 via Docker)

| Command                                                                                                                         | Result                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pnpm validate:ci-local` (frozen install, format, lint, typecheck, budget, unit, clean build, migrate ×2, seed ×2, integration) | PASS                                                                                                     |
| `pnpm test`                                                                                                                     | PASS — 15 files, 202 tests                                                                               |
| `pnpm test:integration`                                                                                                         | PASS — 3 files, 16 tests (also 5 consecutive reruns)                                                     |
| `pnpm context-budget`                                                                                                           | PASS — 73 files, 0 over 500 lines, 0 over 700                                                            |
| Fresh volume: `pnpm db:migrate`, `pnpm seed:ravenford` ×2                                                                       | `0001_world_event_store` applied; 14 commands → 18 gapless events; second seed: 14 duplicates, 0 written |
| `node --conditions=@ltw/source apps/server/src/world-engine/seed-ravenford-cli.ts`                                              | PASS (source mode resolves workspace packages)                                                           |

## Assumptions

- A campaign has exactly one world, and the creating user is its DM. The application layer supplies the actor; the `system` actor must never come from client input.
- World time is integer seconds from Day 1 00:00:00. Calendars and weather are presentation.
- Ravenford event names map onto kernel events with identical semantics (ADR 0007): `NPC_CREATED` → `EntityCreated`, `NPC_PLACED` → `EntityPlaced`, `NPC_UPDATED` → `EntityProfileUpdated` / `EntityStatusChanged`.

## Known limitations (deliberate for Stage 10)

- No HTTP routes for the kernel. Its projections are canonical/DM data and must not be exposed before the Stage 20 knowledge boundary.
- Undo works one command at a time. There is no redo and no cascade (Stage 110 decides). Retroactive in-world changes beyond new-entity backstory are not supported (ADR 0006).
- Each process replays full history and caches it per campaign without eviction. No snapshots yet.
- Sustained multi-process contention can still return `CONCURRENCY_CONFLICT`, which is safe to retry with the same command ID.
- Statuses such as `dead` are DM-authored facts. Deterministic rules (Stage 40) do not exist yet.
- The GitHub Actions workflow has still not run on GitHub (no remote); `scripts/ci-local.sh` mirrors it and passes.

## Before Stage 20

- No pending product decision blocks Stage 20. Its knowledge types and scopes come from `PRODUCT_BLUEPRINT.md`, and its due surfaces from `docs/GATE_COVERAGE.md` (row 20).
- Stage 20 runs at Opus **MAX** (`EFFORT_MATRIX.md`) and ends at Astra Gate 01.
- Knowledge events must declare footprints on kernel facts so that undo stays safe (ADR 0006 §9).
