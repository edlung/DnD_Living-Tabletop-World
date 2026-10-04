# World Kernel (`packages/domain/src/kernel/`)

Authority: `docs/adr/0006-temporal-model-and-undo.md` (owner-approved semantics) and `docs/adr/0007-world-kernel-model-and-event-store.md` (model, pipeline, storage). Read the relevant ADR section before changing behavior.

| Concern                                                                        | File                                                                                                               |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| State shape, kind/status rules                                                 | `state.ts`                                                                                                         |
| Event schemas, envelope, load-time parsing                                     | `events.ts`                                                                                                        |
| Fold / replay                                                                  | `evolve.ts`                                                                                                        |
| Undo dependency facts (reads/writes per event)                                 | `facts.ts`                                                                                                         |
| Decision contract, resolved commands                                           | `decision.ts`                                                                                                      |
| Authorization and the authority it grants (DM, system, controlling player)     | `authorization.ts`                                                                                                 |
| Command rules                                                                  | `decide/entities.ts`, `decide/world.ts` (campaign, scenes, clock), `decide/undo.ts`, dispatcher `decide/decide.ts` |
| Engine pipeline, caching, retries                                              | `engine/world-engine.ts`                                                                                           |
| Store port + in-memory store                                                   | `engine/event-store.ts`, `engine/in-memory-event-store.ts`                                                         |
| Projections                                                                    | `projections/audit-trail.ts`, `projections/world-view.ts`, `projections/integrity.ts`                              |
| Test support: harness, random commands                                         | `testing/kernel-harness.ts`, `testing/random-commands.ts`                                                          |
| Re-decision oracle (exported for tests and audits)                             | `verification/redecide.ts`                                                                                         |
| Combat port, encounter records and events (decided by `@ltw/combat`, ADR 0015) | `../combat/` (`port.ts`, `records.ts`, `events.ts`, `evolve.ts`, `authoring.ts`)                                   |

Rules for changes:

- Decisions are pure: no clocks, random numbers, or I/O. Inject and record nondeterminism through the engine.
- Every new event type needs a zod schema, a fold case, a `footprintOf` case (reads **and** writes, including kernel facts it depends on), undo restore handling if its command is undoable, and tests for undo safety.
- While a reaction window is open, `decide/reaction-pause.ts` applies the pause rule to every command (ADR 0016): combat waits, and nothing may write a fact the window's opening read. Undo keeps its own footprint rule; in addition, undoing the command that closed a window is refused while a later command changed what the window depends on (`../combat/reaction-undo.ts`; Gate 03, G03-H01). A decision that resolves things in turn folds its own drafts with `provisional.ts` (`foldDrafts`).
- A decision's legality premises, including the authority it was issued under, must appear in its footprint. `verification/redecide.ts` re-decides every still-effective command after random undos; keep it in the randomized tests so that an omitted premise is caught even when nothing recorded it (Gate 02).
- Never edit or reorder stored events; payload changes need a new `schemaVersion` and upcasting on load.
- Canonical/DM data only. Any player-facing projection must go through the knowledge boundary (`packages/domain/src/knowledge/`).
- `KernelEvent` is the whole campaign-stream union: kernel events plus knowledge events (`knowledge/events.ts`). Knowledge footprints live in `facts.ts` with the others.
- Keep each file under 500 lines; when adding a domain (knowledge, memory, …), give it its own folder rather than growing these files.
