# 0050. The world around: light and sight, rests by the full rules, hazards, armor

- Status: Accepted (owner-delegated product decision 2026-11-02; `docs/FULL_GAME_PLAN.md` Stage 640,
  decisions 5 and 6, owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`). Extends ADR 0011
  (each further SRD rule needs an ADR before it is implemented), ADR 0015 §3 (the battlefield),
  ADR 0045 (Blinded, Invisible and the Hide action, whose light and sight 640b left for here),
  ADR 0048 §4 (a knock-out a Short Rest ends) and ADR 0049 §11 (deep water, where breath runs out).
  Stage 640g: §1–§4 in its first part, §5–§7 in its second, §8–§10 in its third.
- Context: every square of the board was in bright light and every creature saw every other; the
  DM's rests (Stage 530) gave a Long Rest's benefits whenever called; the DM handled cold, heat,
  smoke, drowning and poison by hand; armor was a number on the sheet. A table meets a crypt in
  darkness, a dwarf who sees in it, a bat that hears what it cannot see, fog, a rest cut short by
  wolves, a second long rest in one day, a frozen pass, a flooded cellar, a poisoned blade, and a
  rogue in chain mail who wants to hide.

## Decision

1. **Light** (SRD 5.2.1): each square is in Bright Light, Dim Light or Darkness. The battlefield
   says its light — `ambient` (Bright when absent) and squares lit otherwise — and its obscured
   squares: Lightly Obscured (patchy fog, moderate foliage) or Heavily Obscured (opaque fog, dense
   foliage). Dim Light lightly obscures, Darkness heavily obscures. Until Stage 670's map tools the
   light comes with the battlefield of a prepared or started encounter; the DM changes it with the
   DM's hand of a running fight.
2. **Senses**: a sheet or a stat block may name Blindsight, Darkvision, Tremorsense and Truesight
   with their ranges in feet. Within its Darkvision a creature sees Dim Light as Bright and
   Darkness as Dim; within its Blindsight or Truesight it sees whatever is there — Truesight also
   through magical Darkness and Invisibility; Tremorsense finds a creature on the ground. A
   creature sees another unless that one stands in a square heavily obscured to it, is Invisible
   to it, or it is Blinded (Blindsight and Truesight see through those that fit them).
3. **Unseen attackers and targets** (SRD 5.2.1): an attack against a creature the attacker cannot
   see has Disadvantage; an attack by a creature its target cannot see has Advantage. A spell that
   needs a target the caster can see cannot target a creature it cannot see. A Wisdom (Perception)
   check that relies on sight into a lightly obscured square has Disadvantage (Search; ADR 0045 §5).
4. **Hiding** (ADR 0045 §5, completed): a creature may take the Hide action while heavily obscured
   to every enemy that could see it, not only behind Three-Quarters or Total Cover.
5. **The Long Rest** (SRD 5.2.1): a character benefits from one Long Rest in 24 hours of world
   time, and only if it has at least 1 Hit Point when the rest begins; the DM's long rest rests
   those who may and names those who may not.
6. **A rest cut short**: the DM ends a Long Rest after the hours that passed. One hour or more
   gives the benefits of a Short Rest — the Short Rest opens, Hit Point Dice to spend — and no
   Long Rest's; less gives nothing. A fight that starts ends an open Short Rest.
7. **A Short Rest's end** wakes a knocked-out creature (ADR 0048 §4): the DM ends the rest, those
   knocked out come round with their hit points.
8. **Hazards in a fight**: a creature fully immersed (ADR 0049 §11) without a Swim Speed holds its
   breath for 1 + its Constitution modifier minutes (at least 30 seconds), counted in rounds of
   6 seconds; out of breath it gains 1 Exhaustion level at the end of each of its turns, and loses
   those levels once it breathes again. **Hazards of the road**: the DM exposes the party to
   Extreme Cold (a DC 10 Constitution save each hour, or 1 Exhaustion level; Resistance or
   Immunity to Cold passes) or Extreme Heat (a Constitution save each hour, DC 5 the first hour
   and 1 higher each hour after, or 1 Exhaustion level; Disadvantage in Medium or Heavy armor;
   Resistance or Immunity to Fire passes), for the hours that pass.
9. **Poison**: the DM's hand poisons a creature with a Constitution save against a DC: Poisoned
   on a failure, for the duration the DM names (ADR 0045 §2's details carry its end and its save).
10. **Armor** (SRD 5.2.1): an armor's block may name a Strength score and Disadvantage on
    Dexterity (Stealth) checks. A wearer whose Strength is lower has its Speed reduced by 10 ft;
    a wearer of armor with Stealth's Disadvantage has it on the Hide action's check.

## Consequences

- The battlefield gains `light` and `obscured`; sheets and stat blocks `senses`; an old encounter
  reads as bright and clear, an old creature as sighted only by its eyes.
- The server decides every sight from what it knows; the board draws the light as markup (shades
  over the GPT ground) and names it in a square's name; a player is told why an attack has
  Advantage or Disadvantage, never what the DM hides.
- A character's sheet keeps when its last Long Rest ended (world time); breath is kept on a
  combatant's record. Old events stay readable: every new field is optional.

## Invariants affected

Preserves 1, 8 and 9: sight, rests, saves and exhaustion are the server's to compute and the
World Engine's to record; the client only draws and asks.
