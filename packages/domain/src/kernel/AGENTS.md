# World Kernel (`packages/domain/src/kernel/`)

Authority: `docs/adr/0006-temporal-model-and-undo.md` (owner-approved semantics) and `docs/adr/0007-world-kernel-model-and-event-store.md` (model, pipeline, storage). Read the relevant ADR section before changing behavior.

| Concern                                        | File                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| State shape, kind/status rules                 | `state.ts`                                                                                                         |
| Event schemas, envelope, load-time parsing     | `events.ts`                                                                                                        |
| Fold / replay                                  | `evolve.ts`                                                                                                        |
| Undo dependency facts (reads/writes per event) | `facts.ts`                                                                                                         |
| Decision contract, resolved commands           | `decision.ts`                                                                                                      |
| Authorization (DM/system)                      | `authorization.ts`                                                                                                 |
| Command rules                                  | `decide/entities.ts`, `decide/world.ts` (campaign, scenes, clock), `decide/undo.ts`, dispatcher `decide/decide.ts` |
| Engine pipeline, caching, retries              | `engine/world-engine.ts`                                                                                           |
| Store port + in-memory store                   | `engine/event-store.ts`, `engine/in-memory-event-store.ts`                                                         |
| Projections                                    | `projections/audit-trail.ts`, `projections/world-view.ts`, `projections/integrity.ts`                              |

Rules for changes:

- Decisions are pure: no clocks, random numbers, or I/O. Inject and record nondeterminism through the engine.
- Every new event type needs a zod schema, a fold case, a `footprintOf` case (reads **and** writes, including kernel facts it depends on), undo restore handling if its command is undoable, and tests for undo safety.
- Never edit or reorder stored events; payload changes need a new `schemaVersion` and upcasting on load.
- Canonical/DM data only. Any player-facing projection must go through the knowledge boundary (`packages/domain/src/knowledge/`).
- `KernelEvent` is the whole campaign-stream union: kernel events plus knowledge events (`knowledge/events.ts`). Knowledge footprints live in `facts.ts` with the others.
- Keep each file under 500 lines; when adding a domain (knowledge, memory, …), give it its own folder rather than growing these files.
