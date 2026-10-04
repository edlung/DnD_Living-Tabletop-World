# Chronicle (`src/chronicle/`)

Chapters told from a perspective, traced to their source events; memory suggestions for the DM; flashbacks. Authority: `docs/adr/0024-chronicle.md` (owner-approved rendering, suggestions, persistence, flashback dialogue), with ADR 0010 for memories and ADR 0023 for scenes. Gate 05 reviews this surface (`docs/GATE_COVERAGE.md`, row 170).

| Concern                                                                  | File               |
| ------------------------------------------------------------------------ | ------------------ |
| Recorded chapter and entry schemas; hedged knowledge types               | `records.ts`       |
| Entries: a perspective's memories, or the DM's salient events            | `entries.ts`       |
| The DM's event salience table and wording                                | `salience.ts`      |
| Prose rules (cites, hedges, no IDs) and the deterministic template       | `prose.ts`         |
| `GenerateChronicle`: decision, fold, restore, footprint                  | `decide.ts`        |
| Reading chapters; resolving sources to event IDs                         | `views.ts`         |
| Memory suggestions for the DM (drafts only)                              | `suggestions.ts`   |
| Flashback: scene, participants, quoted dialogue, sources                 | `flashback.ts`     |
| Integrity: cited memories and knowledge exist                            | `integrity.ts`     |
| Test support: visual world plus chapter generation as the server does it | `testing/world.ts` |

Rules:

- A non-DM chapter never reads raw events: memories the perspective may see, and the knowledge it may see (ADR 0010). Keep every entry's epistemic types.
- The World Engine recomputes the entries and checks the prose; it never interprets prose. A chapter writes only `chronicle:<id>` and rests on what it tells (`rests`).
- Entries name sources by record or by command and event index, never by event ID or sequence, so the re-decision oracle reproduces them. Views resolve them; sequences and trace IDs are the DM's only.
- Suggestions record nothing. Changing the salience table or suggestion kinds changes what the DM sees: amend ADR 0024.
- Tests: `chronicle.test.ts` (the gate, epistemic types, prose rules, no mutation, undo), `suggestions.test.ts`, `flashback.test.ts`, `defense.test.ts`, `chronicle.property.test.ts` (random memories, chapters, undos, oracle); prose rendering in `packages/ai/src/chronicle.test.ts`; Chapter I over HTTP in `apps/server/src/http/chronicle-routes.test.ts`.
