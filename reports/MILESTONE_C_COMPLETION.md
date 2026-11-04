# Milestone C completion — the DM's tools and the content (Stages 670, 680)

Program `docs/FULL_GAME_PLAN.md` (Milestone C), owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`;
work orders `work-orders/STAGE_670.md`, `STAGE_680.md`; ADRs 0057 and 0058 (each written before its
work); 2026-11-04. Branch `claude/full-game-c`, built on Milestone B's `claude/full-game-b`.

## What changed

### Stage 670 — the DM's tools at the table (ADR 0057)

- **The encounter builder and the DM's hand (670a).** Saved encounters beside the world (migration 0034) built from the bestiary and the campaign's creatures, their difficulty for the party shown
  as they are built, started in one step; `PlaceCombatant` sets any combatant down by choosing or
  dragging its token.
- **Terrain and battle maps (670b).** `PaintTerrain` on the running board and in the builder (walls,
  difficult ground, cover, water, heights, obscured squares); the DM's own battle map, approved and
  aligned (`AlignBattleMap`), the fight taking its grid.
- **Fog of war and shared marks (670c).** `SetFog` hides squares from the players and the display; a
  ruler and spell-area templates on every board; pings, the DM's pointer, strokes and shown areas
  for the live session (migration 0035).
- **Traps and hazards (670d).** SRD traps set hidden or seen, sprung on entering, noticed by Passive
  Perception, found by a Search, disarmed with Utilize; harmful ground on entering and at a turn's
  start.
- **Loot (670e).** What a fallen foe carried, taken after the fight; treasure left at a place; the
  party's stash; coins shared out with change made.
- **Merchants and crafting (670f).** A shop on an NPC (price factor, wares from the catalog),
  buying with change and selling at half; crafting by the SRD with the tools as catalog data,
  helpers, materials and days of downtime, Potions of Healing and Spell Scrolls.
- **The world map and travel (670g).** A region's map with pins and routes (miles, terrain, road),
  journeys at a pace with the clock, extended travel's saves, the DM's history.

### Stage 680 — campaign content (ADR 0058)

- **The DM's editors without AI (680a).** "Make by hand": a place, a person, a creature from the
  bestiary, a story object, a clue, what someone knows, a quest; "Change by hand" on a thing's card
  (name and words, place, in the world or not, a creature's numbers); quests by hand in the party's
  journal; every edit listed in the DM's history and undone there.
- **The handout library and random tables (680b).** Handouts kept for later and given from the
  Party sheet, staying in the library; random tables written as lines in the Dice sheet and rolled
  by the server for the DM alone or for the table (migration 0036).
- **The workshop with the full SRD (680c).** The generator's guide lists every SRD class, spell,
  monster, item and weapon by ID; a generated creature named by its bestiary ID fights with the
  SRD's stat block.
- **The starter adventure (680d).** The Bells of Hollowmere, levels 1–5 in English and Russian:
  thirteen places on the Northern Fens map with routes, six people, seven prepared encounters of
  SRD monsters, three quests, nine clues, four handouts and three random tables, four ready-made
  characters (or the players' own), levels by milestones, 37 GPT pictures; offered on the hub
  beside The Missing Caravan, whose copies now also start with their pictures.

## Verification

- On the last commit (680d): unit 4160 passed (517 files), integration 377 (74); build, lint,
  typecheck, format and the context budget clean — as on every part before it.
- The browser suite on every part's commit: 312 journeys on 680d, 309 in the full run and the three
  others (a stand-in's skip, the phone's layout, the table's display: each under the run's load)
  passing on their own rerun. Every new screen audited at 1440, 768, 390 and 320 px, light and dark,
  in English and in Russian: 0 findings after the fixes each audit led to (wide editor fields, a
  field in error without its red edge, option words left in English, a kept handout's words cut).
- Found on the way and fixed: a campaign that opened at Ravenford's square instead of its scene's
  place; a server image that would have shipped without the new adventure's fixtures.

## What stays the DM's

Spelled out in each ADR's notes: among them a random table's result (what it brings in, the DM brings
by hand), a quest's steps (ticked by the DM), a kept handout's reader (chosen when it is given), the
pictures of ready-made characters (added as for any character) and waterborne travel.
