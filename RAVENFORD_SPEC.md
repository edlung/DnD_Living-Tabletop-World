# Ravenford Vertical Slice Specification v0.1

## Mission
Prove that a 30–45 minute D&D-like session can feel like inhabiting a persistent world while preserving rules, player agency, DM authority, memory and knowledge boundaries.

## Scenario
```text
Arrival at Ravenford -> Market Square -> Mira Vale -> Missing Caravan
-> Caravan Site -> Orin Stonebeard -> Contradiction
-> DM authors witness -> Old Trade Road combat -> Return
-> Day 2 world state -> Chronicle
```

## World
Locations: Market Square, Golden Stag Inn, Orin's Alchemy, Merchant Guild, North Gate, Old Trade Road, Abandoned Caravan Site.

Factions: Merchant Guild, Ravenford Guard, Ashen Circle (secret/partially discoverable).

## Player Character
**Elowen Starwhisper — Ranger 7 / Wizard 8, Level 15**
- HP 78, AC 17, Speed 30 ft
- Relevant skills: Perception, Investigation, Insight, Survival, Arcana, Stealth
- Relevant spells: Hunter's Mark, Healing Word, Misty Step, Fireball, Counterspell, Detect Magic

A full fixture may exist, but only mechanics required by the slice must be deeply implemented.

## NPCs
### Mira Vale
Merchant; friendly, practical, observant. Knows caravan departure/logistics and a previous similar incident. Does not know full Ashen Circle truth.

### Orin Stonebeard
Alchemist; grumpy, cautious, observant. Knows the strange symbol, unusual reagent orders and Captain Thorne. Recognizes evidence from a prior incident. Knowledge does not imply willingness to disclose.

### Captain Thorne
Guard captain. Knows caravan route, patrol schedule and missing patrol report. His testimony conflicts with Mira on departure time.

## Canonical Mystery Truth
- Caravan left Ravenford carrying rare alchemical reagents.
- Caravan disappeared.
- Attack site was manipulated.
- Evidence was arranged to suggest goblins.
- The attackers were not simply goblins.
- Ashen Circle is connected.

This truth is not directly available to Player perspective.

## Arrival / Contextual Interaction
No quest is auto-forced. Selecting Mira returns contextual actions such as Talk, Trade, Ask about Ravenford and Inspect. “Ask about missing caravan” appears only after the concept becomes known/relevant.

Material disclosures create typed knowledge records/events. Quest activation is a narrative projection, not canonical truth.

## Investigation Site
Entities: Broken Wagon Wheel, Goblin Weapon, Strange Symbol, Tracks, Burned Cargo.

Selecting evidence offers contextual actions such as Inspect, Investigate, Detect Magic and Recall. Skill checks are resolved by Rules, not AI prose.

“Goblins attacked the caravan” may exist as HYPOTHESIS and must not silently become FACT.

Mira: caravan left before dawn.
Thorne: caravan left after sunrise.
Knowledge Engine surfaces a contradiction without deciding who is lying.

## Orin Scene
Showing Strange Symbol to Orin surfaces “Ask about symbol.” Disclosure depends on knowledge + trust/relationship + motivation + current context. A prior-incident memory may become recallable.

## DM Authoring Acceptance Flow
During play DM says/types:
> Add a young guard near North Gate who saw the caravan leave.

AI proposes a structured NPC such as Tomas Reed, Guard, age 22, North Gate, with scoped witness knowledge.

Before commit: schema, permission, timeline, location, knowledge and continuity checks. DM previews/edits/confirms according to risk policy.

Commit emits auditable events such as NPC_CREATED, NPC_PLACED, KNOWLEDGE_ASSIGNED and ASSET_GENERATION_REQUESTED.

Player sees Tomas as a native world NPC, not “AI-generated content.”

## Combat Encounter
Old Trade Road:
- 3 Goblin Raiders
- 1 Goblin Shaman

Required mechanics: initiative, movement, attack/damage, cover, AoE, conditions, spell casting and reaction.

Selecting an enemy surfaces contextual legal/relevant actions. Fireball shows affected entities spatially and warns if an ally is in the AoE but does not block a legal choice.

Goblin Shaman casts a spell that opens a valid Counterspell reaction window. Player can CAST or IGNORE. Mandatory acceptance case.

## Return / Time
On return, NPC context reflects structured recent events and permitted knowledge. Advance Day 1 → Day 2 and demonstrate at least one world/presentation change: weather, NPC location, shop availability or dialogue context.

## Chronicle
Generate **Chapter I — Shadows on the Trade Road** from structured events: arrival, Mira, caravan discovery, evidence, Orin recognition, contradiction, road battle and return. Chronicle output remains traceable to source events.

A selected Chronicle memory can open a minimal flashback: scene image + dialogue fragment + participants + world time.

## Minimum Commands
EnterLocation; SelectEntity; InteractWithEntity; StartConversation; ChooseDialogueIntent; PerformSkillCheck; CreateHypothesis; InspectEvidence; MoveCharacter; StartCombat; PerformAttack; CastSpell; UseReaction; EndTurn; CreateNPC; ModifyNPC; AddKnowledge; AdvanceWorldTime; GenerateChronicle.

## Minimum Events
LocationEntered; EntitySelected; ConversationStarted; InformationShared; KnowledgeDiscovered; EvidenceExamined; HypothesisCreated; ContradictionDetected; SkillCheckPerformed; NPC_CREATED; NPC_UPDATED; NPC_PLACED; CombatStarted; TurnStarted; AttackPerformed; SpellCast; ReactionWindowOpened; ReactionUsed; DamageApplied; ConditionApplied; CombatEnded; WorldTimeAdvanced; QuestActivated; QuestUpdated; RelationshipChanged; ChronicleGenerated.

Names may change; semantics require an ADR to change.

## Critical Context Contract
A selected entity query must return visible state plus contextual actions with legality separated from relevance.

Example:
```json
{
  "entity": {"id":"kael","type":"character","name":"Kael"},
  "visibleState": {"hp":{"current":31,"max":92},"distanceFt":40},
  "actions": [
    {"id":"healing_word","legal":true,"relevance":"high"},
    {"id":"cure_wounds","legal":false,"reason":"OUT_OF_RANGE","resolution":{"moveRequiredFt":10}}
  ]
}
```

## Player Acceptance
A new user can enter Ravenford, find Mira without an NPC menu, discover the caravan, investigate world objects, surface a contradiction, interact with Orin, complete combat with a contextual reaction, return to a changed Ravenford and open Chronicle.

## DM Acceptance
DM can create Tomas in natural language, preview/edit/confirm him, see him in Ravenford, assign scoped knowledge, switch to Player View to verify secrecy, perform him as an NPC and undo the authoring mutation when safe/allowed.

## Integrity Acceptance
- Player cannot extract DM-only truth by direct or indirect questioning.
- Mira cannot reveal knowledge she does not possess.
- AI prose cannot declare Orin dead and thereby mutate canonical state.
- Invalid Counterspell is rejected by Rules.
- Timeline-conflicting authoring produces a warning.
- Undo/rollback behavior preserves consistency of dependent knowledge/events.

## Definition of Done
Not “the endpoints work.” The slice is done when the 30–45 minute Ravenford session feels like interacting with a living world.
