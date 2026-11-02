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
   instead leave it at 1 hit point and Unconscious (the attacker's choice, made with the attack, as
   Push's). It stays so until it regains hit points, someone's first aid succeeds (an action, a DC
   10 Wisdom (Medicine) check) or a Short Rest ends. A monster knocked out is a captive the DM may
   keep in the fight or out of it.
5. **Objects**: a door, a chest, a rope the party attacks joins the fight as an object (the DM's
   hand): its Armor Class by its material and its hit points by its size and whether it is fragile
   or resilient (the SRD's tables), immune to poison and psychic damage, every condition and
   every save failed; it does not act or take a turn. Destroyed at 0 hit points, it leaves the
   fight.

## Consequences

- Damage is reckoned in one place (`applyDamage`): immunity, resistance and vulnerability, then
  temporary hit points, then hit points, then what 0 means for the creature — knocked out, dying,
  dead or destroyed.
- Old events stay readable: every new field is optional; a sheet or stat block without them has
  none.

## Invariants affected

Preserves 1, 8 and 9: the server computes every number from the sheet, the stat block and the
rules; the DM's hand records its reason (ADR 0043 §1).
