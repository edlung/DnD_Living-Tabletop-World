# 0013. Investigation: player actions, clues, disclosure, hypotheses

- Status: Accepted
- Date: 2026-10-03
- Stage: 60; extended by Stages 70, 80, 110, 130
- Decision type: product (requires owner approval), with technical notes
- Owner approval: approved as written by the owner on 2026-10-03 (with one attempt per check, and Detect Magic execution deferred to Stage 80), before implementation

## Context

Stage 60 connects Mira, the Missing Caravan, the caravan site, and its evidence into an investigation path. The validation gate requires that "Goblins attacked the caravan" never silently becomes FACT (invariant 7). Until now only the DM or the system could issue commands, so players could not act at all.

`RAVENFORD_SPEC.md` requires several things of this stage:

- Evidence offers Inspect, Investigate, Detect Magic, and Recall.
- The Rules Engine resolves checks, not AI prose.
- Material disclosures create typed knowledge records.

`docs/GATE_COVERAGE.md` (Stages 50–60, Gate 02) adds that investigation paths must not expose secrets through actions, reasons, evidence relations, or hypotheses.

## Decision

### 1. Player commands (new authority)

Each player command names a `characterId`. The controlling player may issue it for their own character, and the DM or the system may issue it for any character. Any other actor gets `FORBIDDEN` before anything is looked up, so a `characterId` reveals nothing. All other commands stay DM/system only.

| Command                                                                   | Effect                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EnterLocation { characterId, locationId }`                               | Moves the character to a location it perceives or knows (ADR 0012). Canonically this is the kernel's `EntityPlaced` with `since = clock`. The world clock does not advance automatically; the DM controls time. There is no travel graph in the slice. A destroyed location may be entered (the ruins remain a place), because a refusal would reveal the status of an absent location. |
| `AskAbout { characterId, npcId, topicId }`                                | Conversation intent "Ask about <topic>". The topic must be an entity the character knows. Disclosure follows §3.                                                                                                                                                                                                                                                                        |
| `ExamineEntity { characterId, entityId, method }`                         | `method` is `inspect` (no roll), `investigation`, or `perception` (skill checks). Discovery follows §2.                                                                                                                                                                                                                                                                                 |
| `FormHypothesis { characterId, scope, statement, subjects?, relations? }` | Creates a HYPOTHESIS record in the PARTY scope (the character must be in the party) or the character's own scope. Rules are in §4.                                                                                                                                                                                                                                                      |

Shared preconditions, checked in an order that protects secrets:

1. The acting character is alive.
2. It is not Incapacitated. This applies to speech and checks. `inspect` and `EnterLocation` are allowed while Incapacitated.
3. The target is selectable (perceived or known). Otherwise `ENTITY_NOT_FOUND`, exactly as for a nonexistent ID.
4. The target is present: `NOT_PRESENT`.
5. Only for a present NPC being spoken to: it is alive (`TARGET_DEAD`).

Rejection messages are fixed strings and carry no details. The Context Engine reports the same legality, and a test proves that context legality and command acceptance agree.

### 2. Clues and discovery

The DM authors **clues** with `AddClue { clueId?, entityId, method, dc?, statement, subjects }`:

- `dc` (5–30) is required for checks and forbidden for `inspect`.
- A clue reveals one EVIDENCE record. Observation is evidence, never FACT.
- Clues are DM data. No player view, action, reason, or relevance depends on whether a clue exists or on its DC.

Discovery:

- **`inspect`** reveals the target's `inspect` clues. It may be repeated.
- **Checks.** The roll is d20 + the character's skill modifier, from the Rules Engine (ADR 0011: no special natural 20/1 on checks). Each character gets one attempt per entity per method; a repeat is `ALREADY_ATTEMPTED`. Every clue with `dc ≤ total` is revealed.
- **Where revealed records go.** They land in the character's party (PARTY scope), or in its own scope if it is not in the party. Each clue is revealed at most once per scope, with `knownSince = clock`.
- **Failure and "nothing here" look the same:** the roll is recorded and nothing is revealed.
- **Memory.** Each successful discovery also records one DISCOVERY memory in the same scope. Its participants are the character and the target, its place is the current location, and it cites the new records.

### 3. NPC disclosure

The DM marks NPC-held records with `SetDisclosure { knowledgeId, disclosure: WILLING | GUARDED }`. The default is GUARDED, and SECRET, UNKNOWN, and CONTRADICTION records can never be WILLING.

On `AskAbout`, the NPC shares every WILLING record in its own scope that mentions the topic and was not yet shared with that scope.

- **What the listener gets.** A shared RUMOR stays RUMOR; anything else becomes TESTIMONY. Either way it is attributed to the NPC and carries the NPC's statement.
- **Provenance.** The source record is kept in an `InformationShared` event that only the DM sees (invariant 18).
- **Memory.** A CONVERSATION memory (the character and the NPC, at that place) records the exchange.
- **Nothing to share.** If nothing is shared, the result is `NO_EFFECT`, whether the NPC knows nothing, guards everything, or has already told everything.

Trust, motivation, and AI dialogue (Orin, Stage 130) may decide _when_ a guarded record becomes shareable, but sharing still goes through this gate. An NPC can share only its own records.

### 4. Hypotheses are never promoted

- A hypothesis may cite only records the character's perspective can see, and name only entities it knows. Anything else is rejected exactly like a nonexistent ID.
- Records are immutable. No command changes a record's type, and nothing promotes a hypothesis automatically, whatever evidence accumulates.
- A DM may add a FACT explicitly as a new, audited record. That is authoring, not promotion.

### 5. Context Engine changes (amends ADR 0012)

- Locations gain `enter_location` (illegal: `ALREADY_HERE`).
- Checks report `ALREADY_ATTEMPTED`.
- The Detect Magic descriptor stays, but executing a spell waits for the Stage 80 spellcasting commands, so resources follow a single casting path.
- Insight, Talk, and Trade remain descriptors (Stage 130).

### 6. Player-visible command outcome

An accepted player command returns an `outcome` whose fields are listed below:

- `ExamineEntity`: the roll (d20, modifier, total) and the IDs of revealed records.
- `AskAbout`: the IDs of shared records.
- `FormHypothesis`: the new record's ID.
- `EnterLocation`: the location.

No clue IDs, DCs, or source records appear.

### 7. Fixture (`fixtures/ravenford/investigation-seed.json`)

**Disclosures:**

- Mira: cargo logistics and the prior incident are WILLING. Her departure testimony was already told in the seed.
- Thorne: route and departure are WILLING; the missing patrol is GUARDED.
- Orin: everything is GUARDED.

**Clues** (player-facing statements that hint but never state the truth):

| Entity             | Method        | DC  | Revealed evidence                                                                                           |
| ------------------ | ------------- | --- | ----------------------------------------------------------------------------------------------------------- |
| Caravan site       | inspect       | —   | Broken wagons and scattered crates fill this roadside clearing; it is where the guild caravan was attacked. |
| Broken Wagon Wheel | inspect       | —   | A wagon wheel lies broken beside the road.                                                                  |
| Broken Wagon Wheel | investigation | 13  | The spokes were sawn through cleanly, not smashed.                                                          |
| Goblin Weapon      | inspect       | —   | A crude goblin blade lies in the grass.                                                                     |
| Goblin Weapon      | investigation | 15  | The blade has never been used: no nicks, no blood.                                                          |
| Strange Symbol     | inspect       | —   | A strange symbol is burned into a wagon plank.                                                              |
| Strange Symbol     | investigation | 14  | The symbol was drawn with care by a practiced hand.                                                         |
| Wagon Tracks       | perception    | 12  | Heavy boot prints, too large for goblins, lead north off the road.                                          |
| Burned Cargo       | inspect       | —   | Some cargo was burned where it stood.                                                                       |
| Burned Cargo       | investigation | 12  | Only a few crates were burned; most of the cargo is gone.                                                   |

## Technical notes (not product decisions)

- **Rolls happen inside the World Engine** during resolution, after the idempotency check, from an injected `SkillCheckPort` (d20 source plus a rules-provided skill modifier). This keeps domain → rules dependency-free; `@ltw/rules` provides the adapter. The event records the d20, the modifier, and the total, and replay never rolls again.
- **Generated IDs.** IDs for records created by a command are pre-generated at resolution as a bounded pool. This is the existing pattern, extended to variable counts.
- **New events:** `ClueAdded`, `DisclosureSet`, `EvidenceExamined`, and `InformationShared`. Each declares its fact footprint and undo restores (ADR 0006, ADR 0007).

## Consequences

- The investigation path is fully deterministic and replayable. Stage 70 builds contradiction detection on the shared testimony.
- Gate 02 attacks these paths: player commands, outcomes, rejection codes, clue secrecy, disclosure, and hypothesis citations.

## Amendments

- 2026-10-03 (Gate 02 remediation, G02-H02). Every accepted player command first records a DM-only `PremisesRecorded` event. It lists what made the command legal:
  - the target being perceived (preferred), or else the **earliest** premise that made it known (the character itself, a party member, or the earliest visible record or memory naming it);
  - the sheet, when the command required the character to speak or roll;
  - party membership, when the command relied on it.

  The event's footprint reads those facts. Undoing a premise while the command stands is therefore `UNDO_UNSAFE` and names the command as a blocker (ADR 0006 §8). Undoing the command first makes the premise undoable again. A redundant, later record about the same target is not a premise and stays undoable.

- 2026-10-03 (Stage 70, ADR 0014 §4): player command results carry no event list and no rejection details, except schema issues. Players may not send `expectedVersion`.
- 2026-10-03 (Stage 70, defect fix): undoing an examination that changed nothing restorable, such as an inspection that found nothing, is `NO_EFFECT`. Before the fix it produced an empty `CommandUndone`, which could not be read back from storage. A randomized replay test exposed it, and a regression test now covers it.

## Invariants affected

Implements 7 for hypotheses. Preserves 1 (all through the World Engine), 3 (players act only through their own characters; authoring stays DM-only), 4, 5, 6, 8, 9, 11, 12, and 20. No invariant is weakened.
