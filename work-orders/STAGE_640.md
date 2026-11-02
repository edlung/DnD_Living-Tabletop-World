# Work Order — Stage 640: Conditions and actions

Authority: owner approval 2026-11-02 (`reviews/OWNER_FULL_GAME_2026-11-02.json`), program
`docs/FULL_GAME_PLAN.md` (Milestone B, decisions 5 and 6); ADR 0045 (written first: ADR 0011 says
each further SRD rule needs an entry or an ADR before it is implemented).

## Sub-stages (one commit each, the suite green at each)

- 640a — The 15 conditions and Exhaustion's levels: the vocabulary (contracts enum; 'slowed' stays
  as the Slow mastery's effect), their effects on attack rolls, saves, checks, speed, actions and
  reactions, concentration, initiative; Charmed (no attack on the charmer), Frightened (no move
  closer); Petrified (resistance to all damage); Exhaustion 1–6 (−2 per level on d20 Tests, −5 ft
  per level, death at 6, a long rest lowers it by 1). Durations in a fight (until the start/end of
  a creature's turn, N rounds) and a save to end at the end of each of its turns, server-rolled and
  recorded; timed conditions end with the fight. The DM's Condition dialog: every condition, a
  duration, a save to end, a source. Chips with words (EN/RU) and a tooltip of the effect; glyphs
  for the new conditions by GPT (the art rule) or words only until Stage 650's art.
- 640b — Actions: Dash, Disengage, Dodge, Help, Hide (Stealth vs DC 15 → Invisible while hidden),
  Ready (an action held for a trigger, spends the Reaction), Search, Study, Utilize, Influence;
  opportunity attacks (leaving reach without Disengage); surprise (Disadvantage on initiative);
  Heroic Inspiration spent to reroll a die.
- 640c — Reactions beyond Counterspell: Shield (+5 AC to the start of the next turn, the triggering
  attack included), Uncanny Dodge (halve an attack's damage), Hellish Rebuke (2d10 fire, Dex save
  for half, after damage), Feather Fall (a fall), a readied action's trigger. The reaction window
  (ADR 0016) grows attack, damage, movement and fall triggers.
- 640d — Weapons: properties (Ammunition, Finesse, Heavy, Light, Loading, Range, Reach, Thrown,
  Two-Handed, Versatile); the 8 masteries (Cleave, Graze, Nick, Push, Sap, Slow, Topple, Vex);
  Unarmed Strike (damage, grapple, shove: DC 8 + Str + PB, Str or Dex save); two-weapon fighting
  (Light: the Bonus Action attack); improvised weapons; ammunition spent, half recovered.
- 640e — Hit points: temporary hit points (no stacking, lost first), a lowered maximum, resistance,
  vulnerability and immunity for characters as for monsters; knocking out (0 HP by a melee attack:
  Unconscious and stable); attacking objects (a door, a rope: AC and HP by size and material).
- 640f — Space and movement: creature size and space, squeezing; speeds (walk, fly, swim, climb,
  burrow), climbing and swimming without a speed, jumping (long and high), elevation and falling
  (1d6 per 10 ft, Prone); mounted combat; underwater combat.
- 640g — The world around: vision and light (bright, dim, darkness; lightly and heavily obscured;
  Darkvision, Blindsight, Truesight), hazards (falling, suffocation, cold, heat), poisons, rests by
  the full rules (one long rest in 24 hours, an interrupted rest and its partial benefits), armor's
  Strength and Stealth rules.

## Boundaries

No new spells beyond the four reactions (Stage 650 brings the SRD spell list); no monsters' new
actions (650); no character creation (660); traps placed by the DM on the map (670). Migrations
additive; events stay readable (enums only grow; new fields optional).
