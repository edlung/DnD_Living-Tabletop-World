# Stage 170 Completion Report — Chronicle

- Work order: `work-orders/OPUS_STAGE_170.md`
- Builder: Claude Opus 5.5 (matrix: HIGH)
- Implementation revision: `2cba5a66745e8fdab676939fd56b625b5281d3a3` (branch `main`)
- Formal gate: none at this stage. Gate 05, after Stage 180, reviews this surface (`docs/GATE_COVERAGE.md`, row 170).
- Status: **COMPLETE**. Stage 180 is not started and needs explicit authorization; EFFORT_MATRIX sets Opus effort MAX for it.

## Decisions

| ADR                                   | Content                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0024](../docs/adr/0024-chronicle.md) | Owner decisions of 2026-10-04: (1) deterministic entries are authoritative, and AI prose is rendered from them, cited, hedged, and traced; (2) moments without memories are offered to the DM as suggested memories, and nothing is automatic; (3) `GenerateChronicle` records `ChronicleGenerated` in history, never as a world fact; (4) the flashback dialogue quotes a visible related record with its type, otherwise the memory summary. |
| Amendments                            | [0007](../docs/adr/0007-world-kernel-model-and-event-store.md) (command, event, fact key, restore, state), [0010](../docs/adr/0010-memory-and-temporal-retrieval.md) (Chronicle from scoped memories; suggestions; a chapter rests on its memories), [0017](../docs/adr/0017-ai-gateway.md) (`narrative` routing; `chronicle` traces)                                                                                                          |

## Delivered

- **Domain (`packages/domain/src/chronicle/`):**
  - **Entries.** A non-DM perspective gets its visible memories in the window, with its visible related knowledge and epistemic types. The DM gets salient effective events, from a fixed table, in fixed words. At most 40 per chapter.
  - **Prose rules** (`checkProse`): only the chapter's keys may be cited; a paragraph that cites testimony, a rumor, an inference, a hypothesis, a contradiction, or an unknown must hedge in words; no IDs. The deterministic template labels each account.
  - **`GenerateChronicle`** (DM or system): the World Engine recomputes the entries, checks the prose, and records `ChronicleGenerated` with `rests`, so a chapter reads every fact it tells. The chapter is undoable. Integrity requires that its cited memories and knowledge still exist.
  - **Views.** Chapters with sources resolved to event IDs; sequences and trace IDs go to the DM only.
  - **Memory suggestions** cover battles, contradictions, arrivals and returns, and a new day, as `RecordMemory` drafts. They record nothing themselves.
  - **Flashback:** the scene as seen then (ADR 0023), the participants, the world time and phase, quoted testimony or rumor (or the summary), and the sources.
- **`@ltw/ai`:**
  - `renderChronicle` runs over `narrative`, under the fallback policy. It validates output with the domain's prose rules, falls back to the template, and traces with purpose `chronicle`.
  - The prompt carries entries under keys, with no IDs. The local provider writes the template.
- **Server:**
  - `POST /campaigns/:c/chronicle` (DM): computes entries, renders, and submits with `expectedVersion`.
  - `GET /campaigns/:c/chronicle?perspective=`.
  - `GET /campaigns/:c/chronicle/suggestions` (DM).
  - `GET /campaigns/:c/memories/:memoryId/flashback?perspective=`.
  - The generic command route refuses `GenerateChronicle`.
  - The gateway routes `narrative` to `[anthropic, local]` with a key and `[local]` without.

## Validation gate evidence — "Every material Chronicle claim traces to source events; prose cannot mutate state"

| Item                | Evidence                                                                                                                                                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Traceability        | `chronicle.test.ts`: every entry's first source is the `MemoryRecorded` of its memory, then the `KnowledgeAssigned` of each cited record; every paragraph cites keys of its chapter. `chronicle-routes.test.ts` (Chapter I over HTTP): every source event ID exists in the campaign's history. DM chapters cite their own events, with sequences. |
| Prose cannot mutate | A chapter whose prose claims Orin died and Ravenford burned is accepted as a record. Every world fact is unchanged.                                                                                                                                                                                                                               |
| Prose rules         | The World Engine and the renderer refuse foreign cites, accounts told as fact, and IDs. `ADVERSARIAL_TESTS.md` C.2: the party hypothesis "Goblins attacked the caravan" told as history is refused; the template labels it "A suspicion, not established".                                                                                        |
| Scoped retrieval    | A party chapter tells party and public memories only, never Elowen's own, NPCs' memories, or raw events (A.5). The renderer's request holds no ID, no Gate 01 PARTY marker, and no planted Gate 04 secret. Players read only chapters of a perspective they hold.                                                                                 |
| Epistemic types     | Mira's account keeps `TESTIMONY` in its entry, its prose, and its flashback. Hypotheses keep `HYPOTHESIS`.                                                                                                                                                                                                                                        |
| Minimal flashback   | `flashback.test.ts` and HTTP: Mira's account opens at Day 1 09:30 in the Market Square, with its image and Mira's portrait. Her words are quoted as TESTIMONY with her as speaker, followed by the sources. Memories the party may not recall are a 404, the same as nothing.                                                                     |
| Chapter I           | Over HTTP:<br>• the ambush, the return, and Day 2 run;<br>• the DM records the suggested memories (arrival on the Old Trade Road, the fight with 4 foes, the return to Ravenford, Day 2);<br>• the generated party chapter tells Mira's account, the decision, the supplies, and those four.                                                      |
| Undo                | A told memory cannot be undone beneath its chapter; after undoing the chapter, it can. `chronicle.property.test.ts`: 5 seeds × 24 random memories, chapters, time, and undos, with integrity after each step, then the oracle and replay. PostgreSQL: a chapter and its trace persist and read back identically after a restart.                  |

**Mutation checks:** 16 of 16 injected defects detected, one at a time:

- players told raw events;
- other holders' memories told;
- hidden knowledge cited;
- accounts told as fact;
- IDs in prose;
- foreign cites;
- a chapter resting on nothing;
- sequences shown to players;
- players reading every chapter;
- the template dropping account labels;
- flashbacks of others' memories;
- flashbacks quoting hidden records;
- suggestions repeating what is remembered;
- the generic route accepting chapters;
- the prompt sending IDs;
- traces shown to players.

The two hidden-record filters guard states that ADR 0010 never accepts. `defense.test.ts` covers them on a deliberately inconsistent state. The flashback's own filter duplicated the memory view's, so it was removed, and the memory view's filter is what the test guards.

## Validation

`pnpm validate:ci-local` exited 0 on `2cba5a6` (`NODE_ENV=test`, docker-compose PostgreSQL). It ran:

- frozen install, format, lint, typecheck;
- context budget: 449 files, none over the limits;
- unit tests: 140 files, 1394 tests passed;
- clean build;
- migrate twice;
- seed twice;
- integration tests: 17 files, 66 tests passed.

## Residual risks and notes

- **Hedging is checked lexically.** A provider could hedge in words yet still imply a fact. The structured entries remain the authority.
- **Not run against the live API.** No key is configured here; prose was produced by scripted providers and the template.
- **The version guard on `POST /chronicle` has no race test.** It is enforced by the World Engine (`VERSION_MISMATCH`), which is tested elsewhere.
- **Suggestions are heuristic:** a memory of the same kind within ten minutes covers a moment. The DM reviews every draft.
- **The UI is not built yet** (Stages 200–230).
