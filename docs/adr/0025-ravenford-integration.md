# 0025. Ravenford integration: semantics ledger, quest projection, and the scenario suite

- Status: Accepted
- Date: 2026-10-04
- Stage: 180; reviewed at Astra Gate 05 (the Stage 190 red team)
- Decision type: product (owner-approved quest ownership, triggers, and visibility) and technical
- Owner approval: on 2026-10-04, before implementation, the owner chose:
  1. Stage 180 implements the Missing Caravan quest as a projection, settling the open allocation in `docs/IMPLEMENTATION_PREREQUISITES.md` (§2);
  2. the quest activates on the party's own record or memory about the caravan (Mira's account), not on the public rumor, and advances by the party's own milestones (§2);
  3. the party, its members' own perspectives, and the DM see it; nobody else does (§2).

## Context

`EXECUTION_PLAN.md` (Stage 180): automate the full scenario, from arrival through investigation, DM authoring, combat and Counterspell, the return, and the time advance, to the Chronicle.

The work order adds:

- account for Ravenford's required command and event semantics and their accepted ADR equivalents, including the Missing Caravan quest-projection transitions;
- exercise them through public or explicit test interfaces;
- record anything without an executable path as required-but-unavailable.

`RAVENFORD_SPEC.md`: "Names may change; semantics require an ADR to change." Invariant 15: quest state is a projection, not world truth.

## Decision

### 1. The semantics ledger

Each of Ravenford's minimum commands and events has an accepted equivalent, decided by the ADR named, and an executable check over a played session (`apps/server/src/testing/scenario/ledger.ts`). `ravenford-ledger.test.ts` reads both lists from `RAVENFORD_SPEC.md` itself and fails if one is missing.

| Ravenford                                      | Implemented as                                                                                                                      | ADR              |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| EnterLocation · LocationEntered                | `EnterLocation` · `EntityPlaced`                                                                                                    | 0013             |
| SelectEntity · EntitySelected                  | `GET …/entities/:id/context`: a read, logged per request, never recorded                                                            | 0012, 0009       |
| InteractWithEntity                             | the chosen context action: `ExamineEntity`, `AskAbout`, `ShowEvidence`, `InsightCheck`                                              | 0012, 0013, 0020 |
| StartConversation · ConversationStarted        | `POST …/npcs/:id/dialogue` (talk): a traced reply and no command; `InformationShared` when something is told                        | 0020 §3          |
| ChooseDialogueIntent                           | dialogue intents `ask`, `show`, `insight` → `AskAbout`, `ShowEvidence`, `InsightCheck`                                              | 0020 §3          |
| PerformSkillCheck · SkillCheckPerformed        | checks resolved by Rules inside `ExamineEntity` and `InsightCheck`; the roll is recorded in `EvidenceExamined` and `InsightChecked` | 0013, 0020 §4    |
| CreateHypothesis · HypothesisCreated           | `FormHypothesis` · `KnowledgeAssigned` (HYPOTHESIS)                                                                                 | 0013             |
| InspectEvidence · EvidenceExamined             | `ExamineEntity` (inspect) · `EvidenceExamined`                                                                                      | 0013             |
| KnowledgeDiscovered                            | `KnowledgeAssigned` to the party, from examination, answers, and Insight                                                            | 0013             |
| InformationShared · ContradictionDetected      | unchanged                                                                                                                           | 0013, 0014       |
| MoveCharacter                                  | `EnterLocation` between places; `MoveCombatant` in combat                                                                           | 0013, 0015       |
| StartCombat, PerformAttack, CastSpell, EndTurn | `StartCombat`, `Attack`, `CastSpell`, `EndTurn`                                                                                     | 0015             |
| UseReaction                                    | `UseReaction` (CAST); `DeclineReaction` (IGNORE)                                                                                    | 0016             |
| Combat events                                  | `CombatStarted`, `TurnStarted`, `AttackPerformed`, `SpellCast`, `DamageApplied`, `ConditionApplied`, `CombatEnded`, unchanged       | 0015             |
| Reaction events                                | `ReactionWindowOpened`, `ReactionUsed`, unchanged                                                                                   | 0016             |
| CreateNPC · NPC_CREATED · NPC_PLACED           | `ApplyAuthoring` with `CreateEntity` (kind npc) · `EntityCreated` · `EntityPlaced`                                                  | 0007, 0018       |
| ModifyNPC · NPC_UPDATED                        | `UpdateEntityProfile`, `PlaceEntity`, `ChangeEntityStatus` · `EntityProfileUpdated`, `EntityStatusChanged`                          | 0007, 0018       |
| AddKnowledge                                   | `AddKnowledge`, directly or within `ApplyAuthoring`                                                                                 | 0008, 0018       |
| ASSET_GENERATION_REQUESTED                     | `AssetRequested`, within the authoring commit                                                                                       | 0022 §2          |
| AdvanceWorldTime · WorldTimeAdvanced           | unchanged                                                                                                                           | 0006             |
| RelationshipChanged                            | unchanged                                                                                                                           | 0019 §3          |
| GenerateChronicle · ChronicleGenerated         | `POST …/chronicle` → `GenerateChronicle` · `ChronicleGenerated`                                                                     | 0024             |
| QuestActivated · QuestUpdated                  | transitions of the quest projection (§2): never recorded                                                                            | this ADR         |

No semantic lacks an executable path. The player-facing UI flows of the spec's Player Acceptance belong to Stages 200–240.

### 2. The Missing Caravan quest projection (owner decisions)

- **What it is.** A quest is computed on read from the campaign's effective history. It is stored nowhere, no command or event records it, and no decision reads it (invariant 15).
- **Definitions are content**, validated at startup: `fixtures/ravenford/quests.json`, or `LTW_QUESTS_FILE`. Each definition has an activation subject and declarative milestones. The milestone kinds are:
  - `reached`;
  - `examined-at`;
  - `hypothesized`;
  - `contradiction-found`;
  - `told-by`;
  - `survived-fight-at`;
  - `returned-to` (after a named stage).
- **Only the party's own history counts:**
  - records and memories in the PARTY scope;
  - its members' placements and examinations;
  - fights a member took part in and came out of alive.

  A record or memory of one character's own never advances it: the rest of the party would learn of it.

- **Activation.** The Missing Caravan activates on the party's first own record or memory about the guild caravan: Mira's account at Day 1 09:30. The public rumor of an overdue caravan (Day 1 06:00) activates nothing.
- **Milestones**, each at its first occurrence after activation:
  - the site reached;
  - evidence examined there;
  - a hypothesis about the caravan;
  - the contradiction;
  - Orin's account of the symbol;
  - the ambush survived;
  - the return to Ravenford after it.

  There is no completion: the mystery stays open in the slice.

- **Transitions.**
  - Each transition is `QuestActivated` once, then `QuestUpdated` per milestone, with a world time, a fixed summary, and the source events it rests on.
  - Transitions are ordered by world time, then by the order history recorded them.
  - Undone commands never count.
- **Visibility.** `GET /campaigns/:campaignId/quests?perspective=…` serves:
  - the party, a party member's own CHARACTER perspective, and the DM; only the DM also gets sequences;
  - an empty list for anyone else (PUBLIC, NPCs, characters outside the party).

### 3. The scenario suite

- **The playthrough.** One Ravenford session is played over the real HTTP application by the DM, the player, and an outsider, using their persona tokens (`apps/server/src/testing/scenario/`). It runs:
  1. arrival and Mira;
  2. the caravan site, with every examination;
  3. a hypothesis;
  4. Orin, with the symbol shown, his account, and Insight;
  5. Thorne and the contradiction;
  6. Tomas authored from natural language, edited, confirmed, his image approved, refined, met, and performed by the DM;
  7. the road ambush: an attack with cover, damage, and Slowed, the Shaman's spell countered, a late answer refused, a move, Fireball, and the end;
  8. the return, with Mira warmer;
  9. Day 2;
  10. the suggested memories;
  11. Chapter I and its flashbacks;
  12. the quest log.
- **Determinism.** Skill checks roll from a script; combat dice sit at their middle face. The engine, decisions, and stores are the production ones.
- **Gate 04's secrets** are planted, and every response the player received is checked against a list of what the player may never see.
- **The suites:**
  - `ravenford.test.ts`: the slice, integrity, the oracle, and replay;
  - `ravenford-ledger.test.ts`: §1;
  - `ravenford-acceptance.test.ts`: Integrity and DM acceptance, and the IGNORE answer;
  - `ravenford.integration.test.ts`: the whole slice on PostgreSQL, with a restarted server agreeing on canon and on every view.

### 4. A correction found by the integration

Memory suggestions (ADR 0024 §6) placed an arrival at the place first entered, even when the party had moved on within the same instant, which ADR 0010's presence check rightly refused. An arrival is now suggested where the member stood once that instant was over, and none is suggested for a region only passed through. This is amended in ADR 0024.

## Consequences

- **Gate 05** reviews the whole backend slice with these executable surfaces (`docs/GATE_COVERAGE.md`, all rows).
- **The UI allocation stays open.** The second open allocation in `docs/IMPLEMENTATION_PREREQUISITES.md` (which of Stages 200–230 owns the return, Chronicle, time, and Tomas UI) remains for the planning of those stages.
- **Further quests** are definitions in the same file. A new milestone kind needs an amendment.

## Invariants affected

Implements 15 (quest state is a projection).

Exercises together:

- 1–7, which cover authority, knowledge, NPC scope, and AI suggestions;
- 9–14, which cover rules, reactions, audit, reconstruction, identity, and visual state;
- 16–18, which cover the authoring pipeline and provenance;
- 20, which covers player agency.

No invariant is weakened.
