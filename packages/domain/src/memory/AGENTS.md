# Memory and Sessions (`packages/domain/src/memory/`)

Security-relevant module. Authority: `docs/adr/0010-memory-and-temporal-retrieval.md` (owner-approved) plus the ADR 0008 perspective rules it reuses. Gate 02 reviews the retrieval path.

| Concern                             | File                                           |
| ----------------------------------- | ---------------------------------------------- |
| Records, kinds needing presence     | `records.ts`                                   |
| Event payloads and undo restores    | `events.ts` (composed into `kernel/events.ts`) |
| Impossible-memory rules, sessions   | `decide.ts`                                    |
| Fold                                | `evolve.ts`                                    |
| Scoped recall, views, sessions list | `retrieval.ts`                                 |

Rules:

- Filter memories to the perspective before matching, scoring, counting, or sorting. Never compute anything over hidden memories that reaches an output.
- Views are built field by field in `retrieval.ts`; cited knowledge and causes are filtered to what the perspective can see.
- Memories are created only by `RecordMemory` (DM/system) or by play (ADR 0013). Play memories are built in `investigation/acting.ts` (`memoryEvent`) from already-verified presence, at the current clock and location and witnessed by the acting character, so they satisfy the same impossible-memory rules. A play memory lists the entities its summary quotes (`named`). Showing evidence records one (ADR 0020 §1); dialogue records none, since a reply is never canonical.
- The location filter nests only through locations the perspective knows (`isWithinKnownLocation`, ADR 0010 amendment). A hidden target or link must answer exactly like a nonexistent location. Never walk canonical structure for a non-DM perspective. `recall-noninterference.property.test.ts` guards every read surface.
- Footprints live in `kernel/facts.ts`; a memory reads every premise (witness placements, participants, location, cited knowledge/memories, session).
