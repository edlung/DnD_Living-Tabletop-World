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
- Nothing creates memories implicitly. New memory sources (discoveries in Stage 60, dialogue in Stage 130) must go through `RecordMemory` and its checks.
- Footprints live in `kernel/facts.ts`; a memory reads every premise (witness placements, participants, location, cited knowledge/memories, session).
