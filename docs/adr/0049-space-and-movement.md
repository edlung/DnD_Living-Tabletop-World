# 0049. Space and movement: size, squeezing, speeds, height, jumping, falling, mounts, water

- Status: Accepted (owner-delegated product decision 2026-11-02; `docs/FULL_GAME_PLAN.md` Stage 640,
  decisions 5 and 6, owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`). Extends ADR 0011
  (each further SRD rule needs an ADR before it is implemented), ADR 0015 §3 (the battlefield's
  squares, difficult terrain, cover), ADR 0046 (Feather Fall, the reaction 640c left for a fall)
  and ADR 0047 (sizes for a grapple, a shove and Push). Stage 640f: §1–§4 in its first part, §5–§9
  in its second, Feather Fall (§8) and §11 in its third, §10 in its fourth.
- Context: every creature filled one 5-ft square and walked; the battlefield knew difficult
  terrain and cover. A table meets an ogre that fills four squares, a corridor too narrow for it,
  a harpy overhead, a stream to swim, a ledge to climb, a pit to jump, a fall, a knight on a horse
  and a fight in a flooded cellar. The board stays a grid of 5-ft squares (ADR 0015); the DM
  paints the new terrain with the map tools of Stage 670 — until then it comes with the
  battlefield of a prepared or started encounter.

## Decision

1. **Size and space** (SRD 5.2.1): Tiny, Small, Medium, Large, Huge, Gargantuan — a sheet's size
   (Small or Medium; Medium when the sheet names none, until Stage 660's species) and a stat
   block's (Medium when none). A Large creature fills 2×2 squares, a Huge one 3×3, a Gargantuan one
   4×4, placed by its north-west square; Small and Medium fill one. A Tiny creature fills one
   square it may share with other Tiny creatures. Distances between creatures run from the nearest
   square of one to the nearest of the other: reach, ranges, opportunity attacks, Help, first aid,
   a grapple's hold. An area takes a creature any of whose squares it covers.
2. **Moving around creatures** (SRD 5.2.1): a mover may pass through the space of an ally, of an
   Incapacitated creature, of a Tiny creature, or of one two sizes larger or smaller than itself;
   such a space is Difficult Terrain to it. It never ends its move in another creature's space
   (Tiny with Tiny excepted). Any other creature's space stops it.
3. **Size and the rules that move or hold**: a grapple or a shove takes hold of a target no more
   than one size larger than the attacker; Push moves a Large or smaller creature.
4. **Walls and squeezing**: the battlefield may mark walls — squares no one stands in or crosses.
   A creature squeezes through a space that fits a creature one size smaller (a Large one along a
   corridor one square wide fills one square while it squeezes): each foot costs an extra foot;
   while squeezed it has Disadvantage on attack rolls and Dexterity saves, and attack rolls against
   it have Advantage, until it stands where it fits again.
5. **Speeds**: Walk, plus Burrow, Climb, Fly (with or without hover) and Swim on a sheet or a stat
   block. A move goes on foot, by air or underground; each step's terrain asks its way: water is
   swum, a rise of more than 5 ft is climbed. Without a Climb or Swim Speed each foot of climbing
   or swimming costs an extra foot (two in Difficult Terrain). A creature with several speeds
   counts all its feet this turn against the speed of the way it moves now. A Prone creature may
   crawl instead of standing up: each foot costs an extra foot.
6. **Height**: the battlefield may raise squares (a cart's bed, a ledge, a roof) and sink them
   (a pit), in feet; a creature stands on its square's ground, and a flyer may be higher. Ground
   within 5 ft of the step before is walked; more is climbed, up or down. Distances count height
   as the SRD's grid does (a 5-ft step up is 5 ft). A flyer that falls Prone, is held to Speed 0 or
   is Incapacitated falls unless it hovers.
7. **Jumping** (SRD 5.2.1): a long jump of up to the creature's Strength score in feet after 10 ft
   on foot just before — in the same move, or earlier in the turn when the move begins with the
   jump, so a player may walk to the edge and then jump — half that standing, over the squares it
   does not touch: a pit, a stream, difficult ground. Landing in Difficult Terrain asks a DC 10
   Dexterity (Acrobatics) check or the creature falls Prone; landing far below is a fall. A high
   jump of 3 + Strength modifier feet (half standing) lifts it onto ground that high without
   climbing. Each foot jumped costs a foot of movement.
8. **Falling** (SRD 5.2.1): 1d6 Bludgeoning damage per 10 ft fallen, at most 20d6, and Prone
   unless no damage was taken. A creature falls when it walks into a pit or off a drop it does not
   climb down, when a push or a shove sends it there, or when a flyer falls. **Feather Fall**
   (ADR 0046's reaction) answers a fall in a window: the caster within 60 ft slows up to five
   falling creatures, who land on their feet and take no damage. A move's fall and an attack's (a
   shove, Push, a flyer struck down) open the window when a character could cast it; the window
   holds the fall's damage and Prone until it closes. A hit that lets its target rebuke and makes
   a creature fall asks the rebuke first, the fall waiting for its answer. A fall from a spell, a
   DM's ruling or a turn's start lands at once: the DM rules Feather Fall there by hand.
9. **Burrowing**: a creature with a Burrow Speed may move underground through earth (not walls):
   while there it has total cover from those above and stops nothing on the surface; it surfaces
   with its move.
10. **Mounted combat** (SRD 5.2.1): once during its move a creature may mount a willing creature
    at least one size larger within 5 ft, or dismount, for half its Speed. A controlled mount (a
    creature the rider's party commands, ADR 0044 §7) acts on its rider's turn, moves as the rider
    directs and has only Dash, Disengage and Dodge; an independent mount keeps its own turn and the
    DM's hand. The rider shares the mount's space. A rider whose mount is moved against its will,
    or who is knocked Prone, makes a DC 10 Dexterity save or falls off Prone within 5 ft; a mount
    knocked Prone throws its rider, who lands on their feet with their Reaction or Prone without.
11. **Underwater combat** (SRD 5.2.1): the battlefield may mark deep water, where creatures and
    objects are fully immersed — every square of the space deep water, nothing flying above it. The
    melee rule below asks of an immersed attacker; the ranged one of an attacker or a target
    immersed. There a melee weapon attack by a creature without a Swim Speed has
    Disadvantage unless the weapon is a dagger, javelin, shortsword, spear or trident; a ranged
    weapon attack misses beyond its normal range and has Disadvantage within it unless the weapon
    is a crossbow, a net, or one thrown like a javelin (javelin, spear, trident, dart); the immersed
    have Resistance to Fire damage.

## Consequences

- Positions stay squares; a combatant gains a height (feet, ground when absent) and a footprint
  from its size. Every rule that measured square to square measures footprint to footprint.
- The battlefield gains optional walls, water (deep or not) and ground heights; old encounters
  read as flat open ground. The board draws them as markup (lines, tints, contours) until Stage
  670's maps bring pictures.
- Old events stay readable: every new field is optional.

## Invariants affected

Preserves 1, 8 and 9: the server computes every step's cost, every fall and every save; the
client only asks the way.
