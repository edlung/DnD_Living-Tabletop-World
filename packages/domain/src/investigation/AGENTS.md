# Investigation (`src/investigation/`)

Player actions, clues, NPC disclosure, and hypotheses. Authority: `docs/adr/0013-investigation.md` and, for guarded disclosure, showing evidence, and Insight, `docs/adr/0020-npc-intelligence.md` (both owner-approved). Gate 02 attacks these paths (`docs/GATE_COVERAGE.md`, Stages 50–60).

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
| `AskAbout` (shareable records as attributed testimony)                | `conversation.ts`            |
| What an NPC would tell a scope now (ADR 0020 §2)                      | `disclosure.ts`              |
| `ShowEvidence` (ADR 0020 §1)                                          | `show.ts`                    |
| `InsightCheck` (DC 13, one per character and NPC; ADR 0020 §4)        | `insight.ts`                 |
| Player-visible outcome on command results                             | `outcome.ts`                 |
| Rules port for skill checks (adapter in `@ltw/rules`)                 | `skill-checks.ts`            |

Rules:

- Player commands name their `characterId`. Authorization (`kernel/authorization.ts`) allows the controlling player or the DM/system, decided from the roster only.
- Rejections for player commands are fixed strings without `details`. Anything neither perceived nor known is `ENTITY_NOT_FOUND`, exactly like a nonexistent ID. Check order: the actor's own state, then selectability, then presence, then target status.
- Every accepted player command first records `PremisesRecorded` (`acting.ts`: `target`, `knownPremise`, `premisesEvent`). It holds what made the command legal: perception, or the earliest knowledge premise, plus the sheet and party membership when relied on. A new player command, or a new legality check, must add its premise there, or undo will miss the dependency (Gate 02, G02-H02). The controlling-player premise is added centrally in `kernel/decide/decide.ts` from the authority `authorize` granted (G02-H03). An accepted player command without `PremisesRecorded` throws. Guarded by `premises.test.ts`, `authority-and-recovery.test.ts`, and `premises.property.test.ts`; the last runs the independent re-decision oracle (`kernel/verification/redecide.ts`).
- A result that found nothing still depends on why (Gate 03 remediation). An examination records the clues it passed over because its scope had found them (`revealed` premise). Detect Magic (`reveal.ts`: `magicSensingPremises`) also records where the caster stood and every magic clue it did not reach, with where its entity was (`unreached` premise). `negative-premises.test.ts` and the what-if undo check in `premises.property.test.ts` guard this.
- Premises are written with `premiseSchema` (`PremisesRecorded` version 2) and read with `recordedPremiseSchema`, which keeps `placement`: revision 88d8137 recorded it in version 1 events, with the entity but not its clues. It is never written again and reads what it originally meant, the entity and where it was; the command that recorded it rests on everything before it anyway (Gate 03 retests 2 and 3; `kernel/event-versions.ts`, ADR 0006).
- Clue existence, DCs, disclosure policy, and source records never reach player views or outcomes. A failed check and a check with nothing to find produce the same events.
- `clueTargetSupportsMethod` in `authoring.ts` shares the exact canonical target-kind
  rule with generated preparation. Investigation/perception clues belong only to
  items/features; do not copy or widen those target sets in a preparation validator.
- No command changes a record's type. Hypotheses stay HYPOTHESIS; a DM FACT is a new record.
- The engine draws IDs and the d20 at resolution (`Resolution` on the stored command). Decisions stay pure; replay never rolls.
- Tests: `testing/world.ts` (full Ravenford seed plus a fake skill-check port with Elowen's modifiers). The validation gate test is `investigation-path.test.ts`. The Context Engine's `command-alignment.test.ts` proves context legality matches acceptance.
- An NPC's disclosure is decided once, by `npcDisclosure` (ADR 0020 §2), for `AskAbout`, Insight, and the dialogue context. Its premises name the attitude when a guarded record was considered, the showing that unlocked one, and every record passed over, withheld or told before (`considered`). A new consumer must record the same premises. `npc-disclosure.test.ts`, `insight.test.ts`, and `npc.property.test.ts` (random undo with the re-decision oracle) guard this.
- A play memory names the entities its generated summary quotes (`memoryEvent`'s `named`); the footprint reads those names.
