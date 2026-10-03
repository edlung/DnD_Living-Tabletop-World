# Investigation (`src/investigation/`)

Player actions, clues, NPC disclosure, and hypotheses. Authority: `docs/adr/0013-investigation.md` (owner-approved). Gate 02 attacks these paths (`docs/GATE_COVERAGE.md`, Stages 50–60).

| Concern                                                               | File                         |
| --------------------------------------------------------------------- | ---------------------------- |
| Canonical data: clues, disclosure, attempts, revealed and shared keys | `records.ts`                 |
| Event payloads and undo restores                                      | `events.ts`                  |
| Fold cases and restores                                               | `evolve.ts`                  |
| Perception (shared with the Context Engine)                           | `perception.ts`              |
| Shared player-command preconditions, uniform rejections, memories     | `acting.ts`                  |
| `AddClue`, `SetDisclosure` (DM)                                       | `authoring.ts`               |
| `EnterLocation`, `FormHypothesis`                                     | `movement-and-hypotheses.ts` |
| `ExamineEntity` (inspect, one-attempt checks)                         | `examine.ts`                 |
| `AskAbout` (WILLING records as attributed testimony)                  | `conversation.ts`            |
| Player-visible outcome on command results                             | `outcome.ts`                 |
| Rules port for skill checks (adapter in `@ltw/rules`)                 | `skill-checks.ts`            |

Rules:

- Player commands name their `characterId`. Authorization (`kernel/authorization.ts`) allows the controlling player or the DM/system, decided from the roster only.
- Rejections for player commands are fixed strings without `details`. Anything neither perceived nor known is `ENTITY_NOT_FOUND`, exactly like a nonexistent ID. Check order: the actor's own state, then selectability, then presence, then target status.
- Every accepted player command first records `PremisesRecorded` (`acting.ts`: `target`, `knownPremise`, `premisesEvent`). It holds what made the command legal: perception, or the earliest knowledge premise, plus the sheet and party membership when relied on. A new player command, or a new legality check, must add its premise there, or undo will miss the dependency (Gate 02, G02-H02). Guarded by `premises.test.ts` and `premises.property.test.ts`.
- Clue existence, DCs, disclosure policy, and source records never reach player views or outcomes. A failed check and a check with nothing to find produce the same events.
- No command changes a record's type. Hypotheses stay HYPOTHESIS; a DM FACT is a new record.
- The engine draws IDs and the d20 at resolution (`Resolution` on the stored command). Decisions stay pure; replay never rolls.
- Tests: `testing/world.ts` (full Ravenford seed plus a fake skill-check port with Elowen's modifiers). The validation gate test is `investigation-path.test.ts`. The Context Engine's `command-alignment.test.ts` proves context legality matches acceptance.
