# 0011. Ruleset: SRD 5.2.1 subset for the Ravenford slice

- Status: Accepted
- Date: 2026-10-03
- Stage: 40; reused by Stages 80, 90, 220
- Decision type: product (requires owner approval)
- Owner approval: approved as written by the project owner on 2026-10-03 (owner choices: SRD 5.2; Healing Word through Magic Initiate (Cleric); 5-ft grid with 5-ft diagonals).
- Post-approval correction (same day): the one-slot-per-turn rule originally said "on its own turn". It now follows the SRD 5.2.1 wording ("on a turn"), because the approved decision is SRD fidelity. The owner was informed.

## Context

`docs/IMPLEMENTATION_PREREQUISITES.md` (Ruleset) requires an approved ruleset before deterministic legality is implemented. The ruleset must cover the source, house rules, slice mechanics, Elowen's multiclass and spell access, and reproducible randomness. The code must not infer an edition. Invariants 8 and 9 make the rules deterministic and the sole authority on legality; invariant 20 keeps legal suboptimal choices legal.

## Options considered

1. **SRD 5.1 (2014).** Healing Word would need a house rule.
2. **SRD 5.2.1 (2024 rules).** It covers every slice spell, and its Magic Initiate feat grants Healing Word without a house rule. Chosen.
3. **A custom subset.** Every number would be ours to justify.

## Decision

### Source and license

- Rules come from the **System Reference Document 5.2.1**, under CC-BY-4.0.
- The required attribution statement lives in `NOTICE.md` at the repository root. The code encodes mechanics and numbers; it does not copy spell or rules text.
- Anything outside the SRD (the Goblin Shaman stat block, for example) is campaign content authored by the DM, not a rules change.

### House rules

None, except the **grid conventions** below, which the SRD leaves to the table.

### Space and distance

- Positions are 5-ft squares `(x, y)` plus an elevation in feet (a multiple of 5).
- Distance is `5 × max(|dx|, |dy|, |dz| / 5)` feet: every square, diagonals included, counts as 5 ft (the owner's choice).
- Movement costs 5 ft per square entered, doubled for difficult terrain. A move longer than the remaining movement is illegal.

### Turn economy

- Per turn: one action, one Bonus Action, and movement up to Speed. One Reaction per round, regained at the start of the creature's turn.
- **One spell slot per turn:** during any single turn (its own or another creature's), a creature may expend at most one spell slot to cast spells, as SRD 5.2.1 states. Slot-free casts (Favored Enemy, Magic Initiate) do not count.

### Resolution

- **Ability checks and saving throws:** d20 + modifier against a DC; ties succeed. Advantage and Disadvantage roll two d20 and keep the higher or lower; when both apply, they cancel. A natural 20 or 1 on a check or save has no special effect.
- **Attack rolls:** d20 + attack bonus against AC (cover adds +2 or +5; total cover blocks targeting). A natural 20 always hits and is a Critical Hit: every damage die of the attack is rolled twice, including Hunter's Mark's extra die. A natural 1 always misses. Death saving throws are Stage 80.
- **Ranges:**
  - weapon normal range, then long range at Disadvantage, then out of range (illegal);
  - spells: their listed range;
  - "Self" spells have no target.
- **Damage and healing:** Hit Points stay between 0 and the maximum.
- **Concentration:**
  - Starting another Concentration effect ends the current one.
  - Damage calls for a Constitution save with DC = max(10, ⌊damage / 2⌋), capped at 30.
  - The Incapacitated condition or death ends Concentration.

### Slice spells and features (SRD 5.2.1 mechanics)

| Spell / feature                 | Mechanics used by the slice                                                                                                                                                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hunter's Mark (L1)              | Bonus Action, 90 ft, V, Concentration ≤ 1 hour; +1d6 Force on hits against the target                                                                                                                                                          |
| Detect Magic (L1, ritual)       | Action, Self, V/S, Concentration ≤ 10 minutes, senses magic within 30 ft                                                                                                                                                                       |
| Healing Word (L1)               | Bonus Action, 60 ft, V; heals 2d4 + spellcasting modifier, +2d4 per slot level above 1                                                                                                                                                         |
| Misty Step (L2)                 | Bonus Action, Self, V; teleport up to 30 ft to an unoccupied space the caster can see                                                                                                                                                          |
| Fireball (L3)                   | Action, 150 ft, V/S/M; 20-ft-radius sphere; Dexterity save; 8d6 Fire, half on success; +1d6 per slot level above 3                                                                                                                             |
| Counterspell (L3)               | Reaction when the caster sees a creature within 60 ft casting a spell with V, S, or M components; the target makes a Constitution save. On a failure the spell has no effect and the action used is wasted; the target's slot is not expended. |
| Longbow                         | Ranged weapon attack, 1d8 Piercing, range 150/600, Heavy, Two-Handed, mastery Slow                                                                                                                                                             |
| Favored Enemy (Ranger 7)        | Hunter's Mark always prepared; 3 slot-free casts per Long Rest                                                                                                                                                                                 |
| Magic Initiate (Cleric), Wisdom | Healing Word always prepared; 1 slot-free cast per Long Rest; may also be cast with Elowen's slots                                                                                                                                             |

### Elowen Starwhisper (fixture, reconciled)

- **Classes:** Ranger 7 (Hunter) / Wizard 8 (Evoker). Proficiency bonus +5.
- **Abilities:** Str 10, Dex 18, Con 14, Int 16, Wis 14, Cha 10. This meets the multiclass prerequisites (Dex, Wis, and Int ≥ 13).
- **Fixed values from `RAVENFORD_SPEC.md`:** HP 78, AC 17, Speed 30 ft. These are recorded as given, not derived.
- **Spell slots:** caster level 12 = Wizard 8 + Ranger 7 halved and rounded up (4) → 4/3/3/3/2/1.
- **Spellcasting:**
  - Wizard spells (Intelligence): save DC 16, attack +8.
  - Ranger spells and Magic Initiate (Wisdom): save DC 15, attack +7.
- **Skills:**
  - Proficient: Perception, Investigation, Insight, Survival, Arcana, Stealth.
  - Expertise (Deft Explorer): Perception.
  - Totals: Perception +12, Investigation +8, Insight +7, Survival +7, Arcana +8, Stealth +9.
- **Combat:**
  - Fighting Style: Archery (+2 to ranged attack rolls).
  - Longbow: +11 to hit, 1d8 + 4 Piercing.
  - Extra Attack: two attacks per Attack action.
- **Slice spells:** Hunter's Mark (Ranger); Detect Magic, Misty Step, Fireball, Counterspell (Wizard); Healing Word (Magic Initiate). Only these are implemented in depth.

### Randomness

- Rules functions never call a random number generator. They take a `Dice` input and return each die result they used, so every outcome is reproducible.
- Live play uses a cryptographically random source in the server; tests use scripted dice.
- From Stage 80 on, roll results are recorded in events, so replay never re-rolls (ADR 0006 §6).

### Canonical character state

A character sheet (static statistics plus current resources: HP, slots, per-rest uses, conditions, concentration) is set by a DM/system command through the World Engine. Resources change through gameplay commands from Stage 80 on.

## Consequences

- Stage 80 (combat), Stage 90 (reactions, Counterspell windows), and Stage 220 (combat UX) reuse these rules and the grid.
- Each further SRD rule needs an entry here or a new ADR before it is implemented.
- Warnings (such as an ally inside a Fireball area) are presentation hints; they never make a legal action illegal (invariant 20).

## Amendments

- 2026-10-04 (Stage 80, ADR 0015 §3–4, owner-approved): the slice adds the Unconscious condition (it includes Incapacitated), death saving throws, damage at 0 HP and massive damage, cover (+2/+5 to AC and Dexterity saves; total cover cannot be targeted), Advantage and Disadvantage from Prone and Unconscious, and the Longbow's damage type and Slow mastery. Mechanics live in `packages/rules/src/combat.ts`.
- 2026-11-02 (Stage 605, owner-delegated; `docs/FULL_GAME_PLAN.md`): **the Fighter, the Rogue and the Cleric** join the Ranger and the Wizard as sheet classes, with what the rules already do: Hit Point Dice (d10, d8, d8), the Cleric a full caster for the multiclass slot table and a spellcasting source, and Extra Attack by class level (`attacksFor`: a Ranger's at 5; a Fighter's at 5, 11 and 20 for two, three and four attacks). Their other features (Sneak Attack, Second Wind, Channel Divinity, subclass features) and the spell lists are Stages 640–660; until then the DM rules on them. Ravenford gains three level-15 companions for Elowen built this way (`fixtures/ravenford{,-ru}/table-seed.json`): Brann Ironvale (Fighter, Champion), Tamsin Quickfoot (Rogue, Thief) and Maren Ashby (Cleric, Life Domain, Healing Word and Detect Magic), their armor and shields worn through `EquipItem`, so their Armor Class follows what they wear.

## Invariants affected

Implements 8 and 9 for the slice and preserves 20. No invariant is weakened.
