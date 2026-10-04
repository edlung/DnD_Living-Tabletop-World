# World Kernel (`packages/domain/src/kernel/`)

Authority: `docs/adr/0006-temporal-model-and-undo.md` (owner-approved semantics) and `docs/adr/0007-world-kernel-model-and-event-store.md` (model, pipeline, storage). Read the relevant ADR section before changing behavior.

| Concern                                                                                | File                                                                                                               |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| State shape, kind/status rules                                                         | `state.ts`                                                                                                         |
| Event schemas, envelope, load-time parsing                                             | `events.ts`                                                                                                        |
| Event schema versions and decoders of earlier versions                                 | `event-versions.ts`                                                                                                |
| Fold / replay                                                                          | `evolve.ts`                                                                                                        |
| Undo dependency facts (reads/writes per event)                                         | `facts.ts`                                                                                                         |
| Fact names; the facts a recorded premise stands for                                    | `fact-keys.ts`, `premise-facts.ts`                                                                                 |
| Decision contract, resolved commands                                                   | `decision.ts`                                                                                                      |
| Authorization and the authority it grants (DM, system, controlling player)             | `authorization.ts`                                                                                                 |
| Command rules                                                                          | `decide/entities.ts`, `decide/world.ts` (campaign, scenes, clock), `decide/undo.ts`, dispatcher `decide/decide.ts` |
| Engine pipeline, caching, retries                                                      | `engine/world-engine.ts`                                                                                           |
| Store port + in-memory store                                                           | `engine/event-store.ts`, `engine/in-memory-event-store.ts`                                                         |
| Projections                                                                            | `projections/audit-trail.ts`, `projections/world-view.ts`, `projections/integrity.ts`                              |
| Test support: harness, random commands                                                 | `testing/kernel-harness.ts`, `testing/random-commands.ts`                                                          |
| Re-decision oracle (exported for tests and audits)                                     | `verification/redecide.ts`                                                                                         |
| Check that no undo reached beneath an earlier writer's standing command                | `verification/earlier-writers.ts`                                                                                  |
| AI-assisted authoring: `ApplyAuthoring` and the engine's consent step (ADR 0018, 0019) | `../authoring/` (`AGENTS.md`); consent applied in `engine/world-engine.ts`                                         |
| Relationships: NPC attitude toward the party (ADR 0019 §3)                             | `../relationships/` (`AGENTS.md`)                                                                                  |
| Combat port, encounter records and events (decided by `@ltw/combat`, ADR 0015)         | `../combat/` (`port.ts`, `records.ts`, `events.ts`, `evolve.ts`, `authoring.ts`)                                   |

Rules for changes:

- Decisions are pure: no clocks, random numbers, or I/O. Inject and record nondeterminism through the engine.
- Every new event type needs a zod schema, a fold case, a `footprintOf` case (reads **and** writes, including kernel facts it depends on and everything its fold requires to exist), undo restore handling if its command is undoable, and tests for undo safety.
- While a reaction window is open, `decide/reaction-pause.ts` applies the pause rule to every command (ADR 0016): combat waits, and nothing may write a fact the window's opening read. Undo keeps its own footprint rule; in addition, undoing the command that closed a window is refused while a later command changed what the window depends on (`../combat/reaction-undo.ts`; Gate 03, G03-H01). A decision that resolves things in turn folds its own drafts with `provisional.ts` (`foldDrafts`).
- A decision's legality premises, including the authority it was issued under, must appear in its footprint. `verification/redecide.ts` re-decides every still-effective command after random undos; keep it in the randomized tests so that an omitted premise is caught even when nothing recorded it (Gate 02).
- Never edit or reorder stored events. Every payload any revision wrote stays readable with its meaning (Gate 03 retest 2, G03-H05):
  - A change that would reject a stored event or change what it means (removing or renaming a variant or field, narrowing a limit) gives the type its next version in `event-versions.ts`, with a decoder for every earlier version. Additive changes keep the version.
  - Before such a change, add a history the previous revision wrote to `fixtures/history/` (see its `AGENTS.md`) and test that the current reader loads, replays, continues, and safely undoes it (`packages/combat/src/gate03-h05-regressions.test.ts` is the pattern).
  - The re-decision oracle folds commands an earlier writer decided as recorded (their events carry an earlier version): it re-decides only what the current rules decided.
- A type introduced after the dependency contract (`RelationshipChanged`, `AuthoringPremisesRecorded`) is listed in `INTRODUCED_AT` (`event-versions.ts`): versions before it are refused, since no writer ever wrote them.
- Version 2 of every type (3 of `PremisesRecorded`) is the dependency contract: a command records every fact its decision rested on. `MemoryRecorded` and `ContradictionDetected` are at version 3: their version 2 writers quoted names, and answered, without recording all they rested on (ADR 0020 §6). A standing command with earlier-version events rests on everything before it, so undo refuses anything beneath it (owner decision, ADR 0006 retest 3 amendment; G03-H07). If the contract ever changes again, every type gets the next version.
- Canonical/DM data only. Any player-facing projection must go through the knowledge boundary (`packages/domain/src/knowledge/`).
- `KernelEvent` is the whole campaign-stream union: kernel events plus knowledge events (`knowledge/events.ts`). Knowledge footprints live in `facts.ts` with the others.
- Keep each file under 500 lines; when adding a domain (knowledge, memory, …), give it its own folder rather than growing these files.
