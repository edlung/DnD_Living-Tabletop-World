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

- **Stage 130 (2026-10-04), ADR 0020: NPC interactions and records earlier writers left incomplete.**
  - New player commands `ShowEvidence` and `InsightCheck`, with events `EvidenceShown { characterId, npcId, scope, knowledgeId, subjects }` (writes `shown:<scope>|<npc>|<subject>` for newly shown subjects) and `InsightChecked { characterId, npcId, topicId, scope, roll, inferenceId }` (writes the attempt `<character>|<npc>|insight`). Both are listed in `INTRODUCED_AT`. `InsightCheck` draws a d20 at resolution, like the other checks.
  - `PremisesRecorded` (version 3) gains the additive premise kinds `attitude`, `shown`, and `considered`.
  - `MemoryRecorded` gains the optional `named`: a play memory names the entities its generated summary quotes, and reads those names.
  - **Versions.** `MemoryRecorded` and `ContradictionDetected` move to version 3; earlier versions read alike. Their version 2 writers quoted names without recording them, and the answers among those commands did not record what they passed over, so a command with such an event rests on everything before it (ADR 0006 retest 3 amendment). This supersedes the Stage 120 note that `ContradictionDetected`'s `named` kept the version. History: `fixtures/history/b7a1a92-npc-memories.json`.
  - Fact keys and premise facts moved out of `facts.ts` into `fact-keys.ts` and `premise-facts.ts`; footprints are unchanged.
- **Stage 120 (2026-10-04), ADR 0019: relationships, premises, and types introduced at the contract.**
  - New command `SetRelationship` (DM or system) and event `RelationshipChanged { npcId, from, to }`. It reads the NPC's existence and status and writes `relationship:<npcId>`; state keeps `relationships` (absent means neutral).
  - New reads-only event `AuthoringPremisesRecorded { premises }`, written first in an authoring commit whose blocking checks read facts its operations' events do not record (a holder's status).
  - Types first written after the dependency contract (`INTRODUCED_AT` in `event-versions.ts`) refuse versions before it: no writer ever wrote them.
  - `ContradictionDetected` gains the optional `named` field and reads those names (ADR 0014 Stage 120 amendment). This is additive, so it keeps the version.
- **Stage 110 (2026-10-04), ADR 0018: authoring and the consent step.**
  - New command `ApplyAuthoring` (DM only; the system actor is refused). It applies a confirmed proposal as one command: each operation is decided by its own decision function, in order, on the provisional state of its predecessors, and the events of all of them are appended together. Its operations' generated IDs are resolved before deciding, and the stored command must carry them.
  - **Pipeline step 7b, consent.** A decision may state a consent requirement (`Decision.requires`, authoring only: a risk level and warning keys). After a successful decision the engine refuses (`CONFIRMATION_REQUIRED`) a command whose confirmation does not cover it, before stamping. Consent is a commit-time gate, not a premise: the re-decision oracle compares events only, and footprints do not record it.
  - The generic HTTP command route refuses `ApplyAuthoring`; authoring commits come only from stored proposal revisions (ADR 0018 §5).
- **Gate 03 retest 3 (2026-10-04), G03-H07: the dependency contract.**
  - Every event type is now written as version 2 (`PremisesRecorded` as version 3). Version 2 means: the command recorded every fact its decision rested on. Version 1 events come from earlier writers, whose records may miss some. Every version stays readable.
  - Undo applies the owner's rule for such history (ADR 0006 retest 3 amendment): a standing command whose events carry an earlier version blocks undo of anything beneath it (`decide/undo.ts`, `writtenEarlier`). Undo compensations keep their exact footprints for any writer.
  - The re-decision oracle keeps folding those commands as recorded. An independent check, `verification/earlier-writers.ts` (`undoneBeneathEarlierWriters`), confirms that no undo the current writer accepted reached beneath a standing command an earlier writer decided.
  - Genuine histories from five writers are kept in `fixtures/history/`: 017ab0b, 429e2a2, 88d8137 (two), and b38cbbc.
- **Gate 03 retest 2 (2026-10-04), G03-H05: history written by any revision stays readable.**
  - **Versions per type.** The retest 1 remediation removed a premise variant (`placement`) that revision 88d8137 had stored, so its campaigns could no longer be loaded. Schema versions are now kept per event type (`kernel/event-versions.ts`). A type is written with its current version (1 unless listed there). Every version it was ever written with keeps a decoder that reads stored payloads into the current in-memory form. A version a type never had is refused.
  - **What needs a version.** A change that would reject a stored event or change its meaning gets the next version. Additive changes keep the version, as the relaxation of `restores` below did.
  - **`PremisesRecorded` version 2** never holds `placement`. Version 1, written by every earlier revision, holds any premise any of them recorded, `placement` included, read with its original meaning (ADR 0013 retest 2 amendment). The engine refuses to write a payload its type's current version cannot hold, so legacy variants are read-only.
  - **Re-decision.** The re-decision oracle folds as recorded every command an earlier writer decided (one of its events has an earlier version than its type has now), since the rules that decided it may have changed. It re-decides only what the current rules decided, and the folded events must still apply.
  - **Footprints.** Narrative combat records read every creature they name, as their fold requires. The randomized test on an old history found a record stranded by undo where its writer's premises did not cover its target.
  - **Tests.** Histories written by earlier revisions are kept as genuine rows (`fixtures/history/`) and loaded, replayed, continued, and undone by the current code, both in memory and on PostgreSQL.
- **Gate 02 remediation (2026-10-03).** `PremisesRecorded` is a reads-only event: it changes no state and needs no restore. It exists so that dependency-based undo sees the premises of player commands (ADR 0013 amendment, G02-H02). Known entities and their premises now come from one function (`knownEntityBases`), so the two cannot diverge.
- **Gate 02 retest 1 (2026-10-03).**
  - `authorize` returns the authority it granted (`dm`, `system`, `campaign-creator`, or `controller`); `decide` receives it. A player command authorized as `controller` records that premise.
  - `CommandUndone.restores` may be empty: undoing a command that changed nothing restorable takes it out of current canon. Relaxing the minimum keeps every earlier event valid, so no schema version change is needed.
  - Contradiction IDs derive from the causing command and the pair, never from other history, so re-deciding a command yields the same IDs.
  - Test support: `kernel/verification/redecide.ts` re-decides every still-effective command from scratch. It is an independent oracle for dependency-preserving undo, used by the randomized tests.
- **Stage 70 (2026-10-03), defect fix and guard.**
  - **Fix (superseded at Gate 02 retest 1):** an undo whose target changed nothing restorable was rejected as `NO_EFFECT`. Such undo is now accepted with an empty compensation.
  - **Guard:** the engine validates every drafted event against the stored-event schema before stamping. A decision bug now fails the command loudly instead of writing a stream that cannot be loaded.
  - **Detection:** contradiction detection (ADR 0014) runs as a pure post-decision step inside `decide`.
- **Stage 60 (2026-10-03), ADR 0013.** Player commands carry an engine `resolution` (pre-generated IDs and the d20 of a skill check) on the stored command. Resolution happens after the idempotency lookup, so a retried command ID never draws again. Submissions cannot contain it (the submission schema is strict). The World Engine accepts an optional `SkillCheckPort`, and authorization now sees the command, not only its type.
- **Stage 30 (2026-10-03), defect fix.** The duplicate-command lookup (pipeline step 2) is repeated on every attempt _after_ the stream is loaded. Previously, a twin submission that committed between the first lookup and the state load could make the second submission be decided against its own effect (for example `NO_EFFECT`) instead of returning `duplicate`. A two-process integration test exposed this; a deterministic unit regression test now covers it. The pipeline's order and guarantees are otherwise unchanged.
