# 0007. World Kernel model, command pipeline, and event store

- Status: Accepted
- Date: 2026-10-03
- Stage: 10
- Decision type: technical
- Owner approval: not required (technical). It implements the owner-approved semantics of ADR 0006.

## Context

ADR 0006 fixes the product semantics of history, time, and undo. Stage 10 must turn them into a World Engine, kernel events, projections, and PostgreSQL persistence. ADR 0003 deferred the data-access layer to this stage.

## Options considered

- **Location model:** a separate Location aggregate vs locations as world entities of kind `location`. Separate aggregates duplicate identity, assets, and knowledge references.
- **Data access:** ORM / query builder vs raw `pg` behind a small event-store port. The kernel needs about five SQL statements, and an ORM adds nothing to an append-only log.
- **Concurrency:** pessimistic stream locks vs optimistic version check with retry. Optimistic checking needs no long-held locks, and losers re-validate against newer state.
- **Undo dependency tracking:** per-command handwritten checks vs a declared read/write _fact footprint_ per event type. Footprints are derived from stored payloads, so they can be recomputed from history and later domains can extend them.

## Decision

### Model (`packages/domain/src/kernel/`)

- **Campaign**: the stream root; it records the world name, the start time of the world clock, and the DM (the creating user).
- **World entities**: every world thing, including locations. Each has an immutable `entityId`, `kind` (`location | character | npc | creature | item | feature | faction`), and `existsSince`. Its mutable facets are `profile` (name, description), `placement` (location and since), and `status`. Locations carry a fixed `type` and `parentId`.
- **Scenes**: `title`, `locationId`, `startedAt`, `endedAt`. At most one scene is active per campaign.
- **WorldClock**: integer seconds since Day 1 00:00:00, advanced only by `AdvanceWorldTime`.
- **WorldState**: the fold of the stream. ReadonlyMaps hold entities, scenes, used IDs (tombstones), and per-command traces (event range, undone-by).

### Commands and events

| Command (DM or system)                                | Events                                   |
| ----------------------------------------------------- | ---------------------------------------- |
| `CreateCampaign` (any user; becomes DM)               | `CampaignCreated`                        |
| `CreateEntity` (optional backdated initial placement) | `EntityCreated`, optional `EntityPlaced` |
| `PlaceEntity`                                         | `EntityPlaced`                           |
| `UpdateEntityProfile`                                 | `EntityProfileUpdated` (from/to values)  |
| `ChangeEntityStatus`                                  | `EntityStatusChanged`                    |
| `StartScene` / `EndScene`                             | `SceneStarted` / `SceneEnded`            |
| `AdvanceWorldTime` (`by` or `to`)                     | `WorldTimeAdvanced`                      |
| `UndoCommand`                                         | `CommandUndone` (exact restored values)  |

Ravenford's minimum event names map onto these with identical semantics: `NPC_CREATED` → `EntityCreated` (kind `npc`); `NPC_PLACED` → `EntityPlaced`; `NPC_UPDATED` → `EntityProfileUpdated` or `EntityStatusChanged`; `WorldTimeAdvanced` is unchanged. Gameplay commands (`EnterLocation`, `SelectEntity`, …) belong to later stages.

### Pipeline (`WorldEngine.execute`)

1. **Schema:** zod schemas (commands in `@ltw/contracts`, submission envelope in the domain) are strict; unknown fields are rejected.
2. **Idempotency:** the command ID is looked up first. The same canonical-JSON fingerprint returns `duplicate` with the original events. A different fingerprint returns `COMMAND_ID_CONFLICT`.
3. **Resolution:** missing IDs are generated _before_ the decision, so decisions are pure and generated IDs are recorded.
4. **Stream:** the campaign must exist (`CreateCampaign`: must not exist).
5. **Authorization:** DM or system actor. This runs before any existence or state check.
6. **Optimistic expectations:** an optional `expectedVersion` returns `VERSION_MISMATCH` when stale.
7. **Decide:** a pure function of state, history, and the resolved command. It returns events or a typed rejection.
8. **Stamp and fold:** the engine assigns sequence numbers, event IDs (UUID), `recordedAt`, world time, and causation (command ID, type, actor). Folding the new events must succeed before anything is written.
9. **Append:** the command record and its events are written atomically with an expected stream version. A lost race retries from step 2 after a jittered exponential backoff (scheduling only; it never affects decisions or recorded data), up to a bound; when the bound is exhausted the result is `CONCURRENCY_CONFLICT`, which is safe to retry with the same command ID. Backoff was added after a two-process contention test showed starvation without it.

A per-campaign in-process mutex serializes commands within one engine. The database version check serializes across processes.

### Undo footprint

Each event type declares the facts it reads and writes (for example `entity:<id>`, `entity:<id>#placement`, `world#clock`). Every event except `CommandUndone` implicitly reads `world#clock`. Undo of command _C_ is unsafe if any later event of a still-effective command reads or writes a fact _C_ wrote. Restored values come from replaying history up to _C_.

### Storage (migration `0001_world_event_store.sql`)

- `ltw_event_streams(stream_id, version)` is the optimistic-concurrency head.
- `ltw_commands` holds the global command ID (idempotency key), stream, type, actor, fingerprint, resolved command, reason, sequence range, and `recorded_at`.
- `ltw_events` is keyed by `(stream_id, sequence)` with a unique `event_id`. It stores type, schema version, JSONB payload, world time, `recorded_at`, and causation.
- Triggers reject `UPDATE`, `DELETE`, and `TRUNCATE` on events and commands, and `DELETE`/`TRUNCATE` on stream heads.
- Rows (events and command records) are validated against the domain schemas when loaded (`parseRecordedEvent`, `parseStoredCommand`), so replay never folds malformed history.

### Read side

- Projections are pure functions over history: current `WorldState` (`replay`), state as of a sequence, `worldViewAt(worldTime)` under current canon, an audit trail (optionally joined with command reasons), and an integrity checker for structural invariants.
- The engine caches the folded state per campaign and catches up incrementally from the store.
- No HTTP read or write routes are added in Stage 10. Kernel projections are DM/canonical. The first client-facing read surface must come with the Stage 20 knowledge boundary.

## Consequences

- Later domains (knowledge, memory, combat, authoring) add command handlers, event schemas, fold logic, and footprints to the same pipeline and stream. Stage 20 is expected to introduce module-level registration if the kernel files approach their size budget.
- Full-history replay per process start is acceptable for the slice. Snapshots can be added without changing the stream format.
- Event payloads carry `schemaVersion` (1); breaking payload changes require upcasting on load.

## Invariants affected

Implements 1, 11, 12, and 13; prepares 16–17 (pipeline ordering, atomic rejection). No invariant is weakened.

## Amendments

- **Stage 60 (2026-10-03), ADR 0013.** Player commands carry an engine `resolution` (pre-generated IDs and the d20 of a skill check) on the stored command. Resolution happens after the idempotency lookup, so a retried command ID never draws again. Submissions cannot contain it (the submission schema is strict). The World Engine accepts an optional `SkillCheckPort`, and authorization now sees the command, not only its type.
- **Stage 30 (2026-10-03), defect fix.** The duplicate-command lookup (pipeline step 2) is repeated on every attempt _after_ the stream is loaded. Previously, a twin submission that committed between the first lookup and the state load could make the second submission be decided against its own effect (for example `NO_EFFECT`) instead of returning `duplicate`. A two-process integration test exposed this; a deterministic unit regression test now covers it. The pipeline's order and guarantees are otherwise unchanged.
