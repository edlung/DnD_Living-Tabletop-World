# 0048. Hit points: temporary, a lowered maximum, resistances, knocking out, objects

- Status: Accepted (owner-delegated product decision 2026-11-02; `docs/FULL_GAME_PLAN.md` Stage 640,
  decisions 5 and 6, owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`). Extends ADR 0011
  (each further SRD rule needs an ADR before it is implemented), ADR 0015 §4 (0 hit points, death
  saves) and ADR 0045 (Petrified's Resistance). Stage 640e.
- Context: the slice's hit points were a current and a maximum; damage took from the one and
  healing gave to it. A table meets temporary hit points (False Life, a Fighter's Second Wind in
  2024, Inspiring Leader), a wight's Life Drain lowering the maximum, a dwarf's poison resistance,
  a skeleton's vulnerability to bludgeoning, the wish to take a bandit alive, and a door to break.

## Decision

1. **Temporary hit points** (SRD 5.2.1): a buffer beside the hit points, lost first. They do not
   stack: gaining some while holding some keeps the higher. They are not healing — a creature at
   0 hit points gaining them stays Unconscious — and last until spent or a Long Rest. The DM gives
   them (the DM's hand, ADR 0043 §1) until spells and features grant their own (Stage 650, 660).
2. **A lowered maximum**: an effect may lower a creature's hit point maximum (the DM's hand until
   monsters bring Life Drain at Stage 650); current hit points never exceed it, and a creature whose
   maximum reaches 0 dies. A Long Rest restores it.
3. **Resistance, Vulnerability, Immunity** by damage type, for characters (the sheet's, until
   species and features bring their own at Stage 660) as for monsters (the stat block's, the DM's
   until Stage 650's monsters): damage of a type a creature is immune to is 0; Resistance halves it
   (rounded down), Vulnerability doubles it, Resistance first; two Resistances to one type count
   once. Petrified's Resistance to all damage joins them (ADR 0045 §1). The damage record keeps
   what was rolled and what was taken.
4. **Knocking a creature out**: a melee attack that would bring a creature to 0 hit points may
   instead leave it at 1 hit point, Unconscious and Prone (the attacker's choice, made with the
   attack, as Push's; a ranged attack cannot). The sheet or stat block marks it knocked out: it
   stays so until it regains hit points (a Hit Point Die spent in a Short Rest among them),
   someone's **first aid** succeeds or a Long Rest ends; a blow that brings it to 0 makes it dying
   or dead as any other. First aid is an action, a DC 10 Wisdom (Medicine) check, on a creature
   within 5 ft: it wakes the knocked out and stabilizes the dying (the SRD's Help to stabilize, the
   one action the table calls first aid). Healing wakes the dying and the knocked out; a creature
   the DM made Unconscious stays so. A monster knocked out is a captive the DM may keep in the
   fight or take out of it. The Short Rest's own end comes with its full rules (640g).
5. **Objects** (SRD 5.2.1 "Breaking Objects"): a thing at the place — an item or a feature: a
   door, a chest, a rope — joins a running fight on a square by the DM's hand (`AddObject`): its
   Armor Class by its material (cloth 11, glass 13, wood 15, stone 17, iron 19, mithral 21,
   adamantine 23), its hit points by its size, fragile or resilient (Tiny 2/5, Small 3/10, Medium
   4/18, Large 5/27; a Huge one is broken a Large section at a time, the DM's call), Immunity to
   poison and psychic damage. It has no ability scores: it makes no check and fails every save. It
   rolls no initiative and takes no turn; it is no foe that sees, and the rules that name a
   creature — a condition, a weapon's mastery, a grapple or a shove, Help, the slice's spells —
   pass it by. Destroyed at 0 hit points, it stays where it stood, broken; struck in one fight, it
   keeps its damage into the next.

## Consequences

- Damage is reckoned in one place (`applyDamage`): immunity, resistance and vulnerability, then
  temporary hit points, then hit points, then what 0 means for the creature — knocked out, dying,
  dead or destroyed.
- Old events stay readable: every new field is optional; a sheet or stat block without them has
  none.

## Invariants affected

Preserves 1, 8 and 9: the server computes every number from the sheet, the stat block and the
rules; the DM's hand records its reason (ADR 0043 §1).
