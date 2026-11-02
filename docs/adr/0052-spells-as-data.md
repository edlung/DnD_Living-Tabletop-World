# 0052. Spells as data: the SRD's spells cast through the World Engine

- Status: Accepted (owner-delegated product decision 2026-11-02; `docs/FULL_GAME_PLAN.md` Stage 650,
  decision 6, owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`). Extends ADR 0051 §3 (the
  mechanics layer) and ADR 0011 (each further SRD rule needs an ADR before it is implemented) to
  the SRD 5.2.1's 339 spells; the slice's nine spells keep their own code (ADR 0015, 0016, 0046).
- Context: a character could cast nine spells. A table expects the spell list of its class: the
  cantrips that scale with level, the attack and save spells, healing, conditions, the ritual cast
  outside a fight, a higher slot for more dice, and the utility spells whose effect the DM rules.

## Decision

1. **Any SRD spell by its id.** A sheet's spells and `CastSpell` name a spell by its catalog id
   (ADR 0051 §4); the server refuses an id the catalog does not hold. `SPELL_IDS` stays the list of
   the slice's spells, which keep their engine code; every other spell is cast through its data.
2. **The mechanics layer** (`packages/rules/src/srd/spell-mechanics.json`, a contracts schema):
   for each spell its casting time (action, bonus action, reaction, or minutes and hours), range
   (self, touch, feet, sight, unlimited), area (sphere, cube, cone, line, cylinder, emanation, with
   its size), targets (how many, creatures or a point), duration (rounds, minutes, hours, days,
   instantaneous, until dispelled), concentration, ritual, a material's cost and whether it is
   consumed; and its **effect**, one of: an **attack** (melee or ranged, damage on a hit), a
   **save** (an ability; damage on a failure with half or none on a success; a condition on a
   failure, with a save to end it at the end of each turn where the spell says so), **healing**
   (dice plus the spellcasting modifier), **temporary hit points**, **automatic damage** (Magic
   Missile's darts), or **the DM's** — no engine effect: the slot and the action are spent, the
   cast is recorded, and the DM applies what the spell does with the DM's hand; the UI says so.
3. **Higher slots and cantrips.** A higher slot adds the dice, the healing or the targets the
   spell's "Using a Higher-Level Spell Slot" names; a cantrip's dice grow at character levels 5,
   11 and 17. What else a higher slot does is the DM's.
4. **Derived, then curated.** `scripts/srd/spell-mechanics.ts` derives the layer from the text
   where its wording is regular ("makes a Dexterity saving throw", "takes 8d6 Fire damage on a
   failed save or half as much damage on a successful one", "Make a ranged spell attack"); a
   curated table, kept beside it, overrides or completes the irregular. A test holds every spell
   to the schema, every derived number to the text it came from, and lists those left to the DM.
5. **Casting in a fight** goes through the World Engine like every command: the spell known, a
   slot of its level or higher (none for a cantrip, nor for a ritual outside a fight), the action
   economy (one spell with a slot per turn, ADR 0011), range and sight to each target or point,
   the area's squares, concentration (a new concentration spell ends the old). The server rolls
   every attack, save and die, applies resistances and immunities, conditions with their
   durations (ADR 0045) and temporary hit points (ADR 0048); a cast someone could counter opens
   the reaction window (ADR 0016).
6. **Casting outside a fight**: from the sheet, a healing spell on a party member, a ritual (ten
   minutes more, no slot) or any spell with a slot; what it does beyond healing is the DM's.
7. **Material components with a cost** are shown with the spell and recorded with each cast;
   until the item catalog holds such components (Stage 650d) the server does not count them.

## Consequences

- `SpellId` widens to a catalog id; the slice's ids narrow it where code handles them.
- The cast's outcome names its effect for the log, the table's screen and the companion; a
  spell of the DM's shows "The DM decides what this spell does" to its caster and the DM.
- Old events stay readable: a cast's new fields are optional.

## Invariants affected

Preserves 1, 8 and 9: the data describes; the server decides legality, rolls every die and records
every effect through the World Engine; the client only asks and shows.
