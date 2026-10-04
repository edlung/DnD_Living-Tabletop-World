# 0015. Combat Engine: encounters, turns, attacks, spells, damage, conditions

- Status: Accepted
- Date: 2026-10-03
- Stage: 80; extended by Stages 90 (reactions), 130 (NPC actions), 220 (combat UX)
- Decision type: product (requires owner approval), with technical notes
- Owner approval: approved as written by the owner on 2026-10-04, before implementation. Owner choice: SRD 5.2.1 death saving throws for characters at 0 HP

## Context

The Old Trade Road fight (3 Goblin Raiders, 1 Goblin Shaman) requires initiative, movement, attack and damage, cover, area of effect, conditions, and spellcasting (`RAVENFORD_SPEC.md`). The reaction (Counterspell window) is Stage 90. Fireball must show the affected entities and warn about allies without blocking the choice.

ADR 0011 fixes the rules: SRD 5.2.1 and the 5-ft grid where diagonals cost 5 ft. It says death saves are Stage 80, and that from Stage 80 roll results are recorded in events. ADR 0012 promised distance and real range legality once combat positions exist, and ADR 0013 deferred executing Detect Magic to this stage. Invariants 1, 8, 9, 11, 12, and 20 apply. Combat must stay replayable and undoable (ADR 0006).

## Decision

### 1. Encounters and the battlefield

- **Starting.** The DM starts an encounter (`StartCombat`) at a location.
- **Battlefield** (DM-authored):
  - a rectangle of 5-ft squares (at most 40 × 40);
  - difficult-terrain squares;
  - cover squares, each `half`, `three-quarters`, or `total`.
- **Combatants:** up to 16, each with an entity, a side (`party`, `hostile`, or `neutral`), and a starting square. Every combatant must be present at the location and alive. A character must have a sheet; any other combatant must have a stat block.
- **Positions** are canonical only while the encounter runs. Outside combat there are still no positions (ADR 0012).
- **Simplifications.** Every combatant sees every other one: no hiding, darkness, or line-of-sight geometry. A creature standing in a cover square has that cover against every attack and Dexterity save; total cover means it cannot be targeted. Elevation stays 0.
- **Ending.** The DM ends the encounter (`EndCombat`). It never ends by itself.

### 2. Initiative and turns

- **Initiative.** When combat starts, each combatant rolls d20 + initiative bonus: Dexterity modifier for characters, the stat block's bonus otherwise.
- **Order:** highest total first. Ties go to the higher Dexterity score, then the entity ID. Rolls are recorded.
- **Turns.** The current combatant acts, then `EndTurn` passes to the next one; a new round starts after the last.
- **Turn economy.** Per turn: one action, one Bonus Action, and movement up to Speed. One Reaction per round, regained at the start of the creature's own turn. One slot per turn (ADR 0011).
- **Who acts.** A player acts only for their own character, on its turn. The DM (or the system) acts for monsters and NPCs, and may also act for characters.

### 3. Actions in Stage 80

| Command                                                          | Effect                                                                                                                                                                                                          |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MoveCombatant { combatantId, path }`                            | Square by square from the current square; difficult terrain costs double; Slowed reduces Speed by 10 ft. The path may not end on, or pass through, an occupied square. Standing up from Prone costs half Speed. |
| `Attack { combatantId, attackId, targetId }`                     | One attack per command. The first attack uses the Action; Extra Attack or Multiattack allows the rest.                                                                                                          |
| `CastSpell { combatantId, spellId, using, targetId? or point? }` | Slice spells (below) and stat-block spells                                                                                                                                                                      |
| `EndTurn { combatantId }`                                        | Ends the turn and starts the next combatant's turn                                                                                                                                                              |

**Attacks:**

- Range bands and Disadvantage at long range, as in ADR 0011.
- **Cover** adds +2 or +5 to AC.
- **Prone:** a prone target gives melee attacks within 5 ft Advantage and ranged attacks Disadvantage. A prone attacker has Disadvantage.
- **Unconscious:** attacks against an unconscious target have Advantage, and a hit from within 5 ft is a Critical Hit.
- **Rolls:** natural 20 and 1 as in ADR 0011. A critical hit doubles every damage die, including Hunter's Mark.
- **Slow (Longbow mastery):** a hit makes the target Slowed until the start of the attacker's next turn.
- **Goblin weapons:** the extra die on attacks with Advantage applies (SRD mechanics).

**Spells:**

| Spell         | In combat                                                                                                                                                                                                                                                      | Outside combat                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Hunter's Mark | Bonus Action, target within 90 ft. Concentration. +1d6 Force on the caster's weapon hits against the target                                                                                                                                                    | Marks a present creature                                   |
| Healing Word  | Bonus Action, target within 60 ft; heals 2d4 + modifier. A character at 0 HP regains consciousness                                                                                                                                                             | Heals a present creature                                   |
| Misty Step    | Bonus Action, teleport up to 30 ft to an unoccupied, non-total-cover square                                                                                                                                                                                    | Not available (no positions)                               |
| Fireball      | Action, a point within 150 ft. Every combatant whose square is within 20 ft of the point is affected, allies included (legal, invariant 20) unless in total cover. Dexterity save with cover bonus (+2/+5); 8d6 (+1d6 per slot level above 3), half on success | Not available                                              |
| Detect Magic  | Action, Concentration. Reveals the DM's `magic` clues on entities present within 30 ft                                                                                                                                                                         | Same; reveals `magic` clues on present entities (the room) |

Counterspell, and reactions in general, are Stage 90.

**Stat-block spells.** A stat block can also carry DM-authored spells: name, level, Action or Bonus Action, range, components, and an effect. The effect is either a spell attack (attack bonus and damage) or a saving throw (ability, DC, damage, half on success). Components matter for Counterspell in Stage 90.

### 4. Damage, healing, 0 HP, death saves (SRD 5.2.1)

- **Hit Points** stay between 0 and the maximum.
- **Concentration.** Damage to a concentrating creature calls for a Constitution save (ADR 0011 DC). Failure ends Concentration and, for Hunter's Mark, the mark.
- **Monsters and NPCs at 0 HP** die: their status becomes `dead`.
- **Characters at 0 HP** fall Unconscious, a new condition. Unconscious means Incapacitated and Prone, Speed 0, and automatic failure of Strength and Dexterity saves.
- **Death saves.** At the start of each of its turns, an unconscious character at 0 HP makes a death saving throw, a d20 with no modifier against DC 10:
  - three successes: stable;
  - three failures: dead;
  - natural 20: regains 1 HP and consciousness;
  - natural 1: two failures.
- **Damage at 0 HP** adds one failure, two on a critical hit.
- **Massive damage.** If the damage left over after reaching 0 HP is at least the maximum HP, the character dies instantly.
- **Healing** a character at 0 HP restores consciousness, clears the death saves, and leaves the character Prone.

### 5. Monster content (Ravenford fixture)

| Combatant                                | Mechanics                                                                                                                                                                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Goblin Raider ×3**                     | Mechanics of the SRD 5.2.1 Goblin Warrior: AC 15, HP 10, Speed 30, Dex 15 (initiative +2). Scimitar +4 melee, 1d6+2 slashing. Shortbow +4, range 80/320, 1d6+2 piercing. +1d4 on attacks with Advantage                                                                              |
| **Goblin Shaman** (DM-authored, not SRD) | AC 13, HP 21, Speed 30, Dex 14, Con 12, Wis 14 (spell DC 12, attack +4), initiative +2. Dagger +4, 1d4+2. **Ashen Bolt:** level 1, Action, 120 ft, V/S, spell attack +4, 2d8 necrotic. **Binding Hex:** level 1, Action, 60 ft, V/S, Wisdom save DC 12, 2d6 psychic, half on success |

The fixture also defines an Old Trade Road battlefield (wagons give half cover, a ditch is difficult terrain) and starting positions. Stat-block text is our own, and NOTICE.md already carries the SRD attribution.

### 6. What players see

- **Context Engine in combat** (amends ADR 0012):
  - `distanceFt` for combatants.
  - Real legality from the rules: range with `moveRequiredFt`, plus turn reasons (`NOT_YOUR_TURN`, `NO_ACTION`, and so on).
  - A Fireball action centered on the selected creature lists the combatants it would affect and adds the hint `ALLY_IN_AREA` when a party member is inside.
  - Hit points of non-party combatants stay hidden.
- **Encounter view** (`GET /campaigns/:id/encounter?perspective=PLAYER|CHARACTER:<id>|DM`):
  - battlefield squares;
  - turn order with the current combatant and the round;
  - each combatant's square, side, and conscious or down state, with names only when known.
  - Only the DM sees initiative rolls, stat blocks, and the hit points of non-party combatants.

### 7. Not in Stage 80

- Reactions, including opportunity attacks and Counterspell (Stage 90). Until then, moving away from an enemy provokes nothing.
- Dash, Dodge, Disengage, Hide, Help, and readied actions, goblin Nimble Escape included.
- Line of sight, elevation, and flying.
- Monster AI (Stage 130); the DM issues monster actions.

## Technical notes

- **Package.** A new package, `@ltw/combat` (depends on rules, domain, contracts), decides combat commands. The World Engine calls it through a port (`CombatPort`), as with skill checks, so domain never imports rules. `@ltw/context` may depend on `@ltw/combat` for the same legality.
- **Dice.** The engine draws a pool of random values for each combat command at resolution time and records it with the command. Decisions consume the pool deterministically, and events record every roll, so replay never rolls again.
- **State.** Character resources change through `CharacterSheetSet` and monster vitals through `StatBlockSet`. Encounter changes are full-value events. Narrative events (`AttackPerformed`, `SpellCast`, `DamageApplied`, `ConditionApplied`, `DeathSaveRolled`, `TurnStarted`, `CombatStarted`, `CombatEnded`) record the rolls for Chronicle and audit. Every combat command reads and writes the encounter, so undo unwinds combat strictly in reverse order.

## Consequences

- Stage 90 adds reaction windows (Counterspell against the Shaman's V/S spells) on top of these turns.
- Combat is deterministic, replayable, and auditable. Deterministic combat integration tests are the gate.

## Amendments

- 2026-10-04 (Stage 90, ADR 0016, owner-approved):
  - **Counterspell** works through reaction windows.
  - **Opportunity attacks** are deferred by the owner's decision to a later combat-rules extension, which needs its own ADR amendment. Until then, moving away from an enemy still provokes nothing.
  - **Leaving the battlefield.** A combatant cannot change location while the encounter runs: `EnterLocation` and `PlaceEntity` are rejected (`COMBAT_ALREADY_ACTIVE`), and every placement depends on the encounter for undo.
  - **No probing.** A character outside the encounter gets the same `NOT_IN_COMBAT` answer as when no encounter runs, so it cannot detect a fight.
  - **Encounter view** gains `reactionWindow`.
- 2026-10-04 (Gate 03 remediation, G03-H02, G03-H03):
  - **Detect Magic in combat** senses only combatants within 30 ft of the caster, immediately or when a reaction window lets it through. By owner decision, entities without a battlefield square are not sensed during combat; after combat ends, Detect Magic senses the room again.
  - **Premises:**
    - Combat decisions record every combatant's status, sheet, and stat block (ADR 0016 amendment).
    - A spell outside combat records its target's.
    - Authoring a stat block depends on the encounter, because it is refused for combatants.
- 2026-10-04 (Gate 03 retest 1 remediation, G03-H04): **participation, not the existence of a fight, decides.**
  - A spell is decided as in combat only when its caster takes part in the encounter, which is the same test its legality uses.
  - A caster outside a running fight casts exactly as with no fight. Its premises are its own sheet, its target's existence, status, sheet, stat block, and placement, and its own placement.
  - A fight the caster is not in adds no premise of its own.
- 2026-10-04 (Gate 03 retest 2 remediation, G03-H06; owner decision of 2026-10-04): **a fight and the world outside it do not touch.**
  - A caster outside a running fight cannot target any of its combatants. Healing Word and Hunter's Mark at a combatant are refused with `TARGET_IN_COMBAT` (an `ILLEGAL_ACTION`), between turns and while a reaction window is open alike. This mirrors §3, where a combatant's spells reach only combatants.
  - The refusal comes after every other reason the caster would get, so it tells the player only that a creature the character perceives is fighting. A player whose character perceives combatants may learn that much, never anything about initiative, rolls, or reaction windows. The Context Engine shows the same reason (§6).
  - Detect Magic, and spells at creatures outside the fight, are unchanged: the caster still casts exactly as with no fight (retest 1 amendment).
  - So nothing a character outside the fight may do changes what a reaction window depends on (ADR 0016 retest 2 amendment).
  - Technical note (G03-H05): narrative records (`AttackPerformed`, `SpellCast`, `DamageApplied`, `HealingApplied`, `SavingThrowRolled`, `ConditionApplied`, `DeathSaveRolled`) read every creature they name, as their fold requires, so undo cannot remove a creature a standing record names, whatever premises its writer recorded.

## Invariants affected

Implements 8, 9, 10 (groundwork), and 20 for combat. Preserves 1, 4, 5, 11, and 12. No invariant is weakened.
