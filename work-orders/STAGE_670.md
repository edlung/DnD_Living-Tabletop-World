# Work Order — Stage 670: Encounters, maps, loot

Authority: owner approval 2026-11-02 (`reviews/OWNER_FULL_GAME_2026-11-02.json`), program
`docs/FULL_GAME_PLAN.md` (Milestone C, decisions 5, 6 and 19); ADR 0057 (written first). Branch
`claude/full-game-c`, stacked on Milestone B (`claude/full-game-b`) until that merges.

## Sub-stages (one commit each, the suite green at each)

- 670a — The encounter builder and the DM's hand: saved encounters beside the world (migration
  0034), built from the bestiary and the campaign's creatures with counts and squares, the
  party's difficulty shown as they are built, started through the World Engine in one step; the
  workshop's encounters listed beside them. On a creature's turn the DM picks its square and the
  ways to it on the board; `PlaceCombatant` sets any combatant down on a free square, by choosing
  it and its square or by dragging its token. Done: saved encounters with their difficulty and a
  one-step start, `PlaceCombatant`, the DM's hand by choosing and by dragging (ADR 0057 notes).
- 670b — Terrain and battle maps: `PaintTerrain` on the running battlefield and in the builder
  (walls, difficult ground, cover, water, heights, obscured squares, clear); a battle map uploaded
  by the DM, re-encoded and approved as the location's; `AlignBattleMap` (a cell's size and the
  origin in pixels) and a fight there taking the map's columns and rows. Part 1 done: `PaintTerrain` on the
  running battlefield and the DM's brush on the board.
- 670c — Fog of war and shared marks: `SetFog` hides and reveals squares; the players' and the
  display's views leave out what lies hidden; the DM sees a veil. A ruler and spell-area templates
  on every board (the geometry moved into contracts, shared with the rules); pings, the DM's
  pointer, strokes and placed templates kept beside the world for the live session (migration
  0035), players marking when the DM allows.
- 670d — Traps and hazards on the board: an SRD trap set on squares, hidden or seen, sprung on the
  creature that enters, found by passive Perception or Search, disarmed with Utilize and thieves'
  tools; hazard squares that harm a creature entering or starting its turn there.
- 670e — Loot, the stash and coins: creatures carry items; the party takes a fallen foe's; the DM
  leaves treasure at a place; the party's stash; coins split with change.
- 670f — Merchants and crafting: an NPC's stock and prices, buying and selling at the SRD's rates
  with change made; crafting by the SRD (tools, half cost in materials, cost ÷ 10 days, helpers),
  Potions of Healing and Spell Scrolls, projects advanced by days of downtime.
- 670g — The world map and travel: a region's map with pins, routes with miles, terrain and roads,
  the party travelling at a pace, the clock advancing, extended travel's Constitution saves.

## Checks at each sub-stage

Format, lint, typecheck, context budget, unit and integration tests, build; the browser suite for
anything a screen shows; the layout audit (1440, 768, 390, 320; light and dark; RU and EN) for every
new screen. Players' views are tested against the DM's for what fog and hidden traps must not show.
