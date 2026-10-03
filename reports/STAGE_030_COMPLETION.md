# Stage 30 Completion Report — Memory & Timeline

- Work order: `work-orders/OPUS_STAGE_030.md`
- Builder: Claude Opus 5.5 (matrix: HIGH)
- Implementation revision: `244c83d8ea8a90682eaa8e7d5a2af32285943e63` (branch `main`)
- Formal gate: none at Stage 30. The new retrieval path is reviewed at **Astra Gate 02** (after Stage 70), per `docs/GATE_COVERAGE.md` row 30.
- Status: **COMPLETE — awaiting owner authorization for Stage 40**

## Decisions

| ADR                                                                      | Decision                                                           | Approval                                                                      |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| [0010](../docs/adr/0010-memory-and-temporal-retrieval.md)                | Memories, sessions, impossible-memory rules, scope-first retrieval | Approved as written by the project owner on 2026-10-03, before implementation |
| [0007](../docs/adr/0007-world-kernel-model-and-event-store.md) amendment | Duplicate-command lookup repeated after loading state (defect fix) | Technical                                                                     |

## Delivered

- **Contracts:** memory kinds and scopes, `RecordMemory`, `StartSession`, `EndSession`, and memory/session views.
- **Domain** (`packages/domain/src/memory/`):
  - Immutable single-holder memories (PUBLIC, PARTY, CHARACTER, NPC).
  - Rejected memories: from the future; from before the holder, participants, or location existed; unwitnessed observations or conversations (presence comes from the world timeline, and a holder inside a location counts as present there); citations of knowledge or memories the holder cannot see; causes later than their consequence.
  - Premises are undo footprints, so a placement a memory relies on cannot be undone while the memory stands.
  - Sessions.
  - Recall filters to the perspective before matching, scoring, counting, or ordering. Filters: text, entity, location (containment), world-time window, kind, session, as-of, limit.
- **Server:** `GET /memories`, `GET /memories/:memoryId`, and `GET /sessions` (campaign members only).
- **Fixtures:** `memory-seed.json` (Session 1 plus nine memories, including Orin's recallable prior incident) and `memory-boundary.json` (the shared specification).
- **Defect fixed:** a twin submission that committed between the duplicate check and the state load could be decided against its own effect. Found by an existing two-process test; a deterministic regression test was added first. This changes only the order of the engine's duplicate lookup; the Gate 01 knowledge boundary code is unchanged.

## Validation gate evidence

| Gate item                     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Impossible memories           | `memory/decide.test.ts`: future, before the holder existed (Tomas, B2), participants not yet existing, distant observer (B3), conversation without the holder, unwitnessed party memory, hidden citations, cause after consequence, no implicit memories (B4), premises block undo                                                                                                                                      |
| Temporal consistency          | As-of recall, world-time windows, presence from the world timeline; randomized replay/integrity property tests now include memories and sessions                                                                                                                                                                                                                                                                        |
| Retrieval scope and isolation | Exact recall sets for six perspectives; forbidden-marker crawls over every query, filter, and ID (domain and HTTP); hidden equals nonexistent; scope-first proofs (hidden-only words behave like nonsense; scores identical with hidden memories removed); J1–J4; PostgreSQL vs memory equality before and after restart. Mutation checks: visibility bypass, unfiltered causes, skipped presence check — all detected. |

## Commands and results (Node 25.8.1, pnpm 11.11.0, PostgreSQL 18)

| Command                                                   | Result                                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm validate:ci-local`                                  | PASS                                                                       |
| `pnpm test`                                               | PASS — 25 files, 477 tests                                                 |
| `pnpm test:integration`                                   | PASS — 4 files, 17 tests (two-process race test also run 5× after the fix) |
| `pnpm context-budget`                                     | PASS — 111 files, 0 over 500 lines                                         |
| Fresh volume: `pnpm db:migrate`, `pnpm seed:ravenford` ×2 | PASS — 65 commands → version 74; reseed writes nothing                     |

## Assumptions and limitations

- Relevance is lexical (word overlap) until an embedding index arrives with the AI stages; scope-first filtering stays mandatory.
- Party presence and party access follow the current assignment; historical membership is not modeled.
- Session titles are visible to all campaign members by design.
- Memory records are immutable; corrections are undo plus a new record.
- Gate 02 has not reviewed the memory surface yet. It is **NOT YET REVIEWED**; this report does not claim it passed.
