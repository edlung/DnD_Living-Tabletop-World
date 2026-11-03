# 0057. Encounters, maps and loot: the DM's board, the world map, treasure and trade

- Status: Accepted (owner-delegated product decision 2026-11-03; `docs/FULL_GAME_PLAN.md` Stage 670,
  decisions 5, 6 and 19, owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`). Builds on ADR
  0015 (the combat engine), 0043 (the DM's screen), 0049 (space and movement), 0050 (light and
  sight), 0053 (monsters as data), 0054 (items as data), 0055 (the Gameplay Toolbox), 0033 (the
  live session) and 0035 (images). The rules it adds are the SRD 5.2.1's: Travel Pace and Travel
  Terrain (pages 12, 192), Selling Equipment (89), Crafting Nonmagical Items, Brewing Potions of
  Healing and Scribing Spell Scrolls (103).
- Context: Milestone B made the rules whole; a DM still prepares a fight by hand (one prepared
  encounter in Ravenford's fixtures, monsters added one by one at a typed square), moves a monster
  only through the suggested turn, cannot paint the battlefield, hide part of it or point at it,
  and the party cannot travel by the map, loot a foe, keep a common stash, buy, sell or craft.

## Decision

1. **The encounter builder.** The DM builds encounters from the bestiary and the campaign's own
   creatures: a name, a place, a battlefield (its size and terrain), foes with counts and squares,
   the party's squares. The server shows the fight's difficulty for the party as it is built (the
   SRD's budgets, ADR 0053 §3). Saved encounters are the DM's preparation, kept beside the world
   (a store, as the DM's notes are), never seen by players; starting one is the World Engine's:
   each foe made from its stat block (CreateEntity, SetStatBlock, numbered names), placed, and the
   fight started with the saved battlefield and squares, through one route whose command IDs follow
   from the request (a retry starts it once). The workshop's encounters are listed beside them.
2. **The DM's hand on the board.** On a creature's turn the DM chooses its square on the board and
   the ways to it, as a player does (`MoveCombatant`); at any time the DM sets a combatant down on
   a free square (`PlaceCombatant`: no movement spent, no opportunity attack, a rider carried),
   by choosing it and its square or by dragging its token. The DM paints the running battlefield's
   terrain (`PaintTerrain`: walls, difficult ground, cover, water, heights, obscured squares,
   clear); the encounter builder paints the same before the fight.
3. **Battle maps.** A battle map is a location's picture, made by GPT as today or uploaded by the
   DM (an image the server re-encodes and keeps as the location's approved `battle-map`). The DM
   lines its grid up: a cell's size and the grid's origin in the picture's pixels; the board then
   draws the picture under squares that match its own (`AlignBattleMap`), and a fight there takes
   the grid's columns and rows. A saved encounter keeps where the tokens stand.
4. **Fog of war.** The DM hides squares of a running fight and reveals them (`SetFog`; decision 19:
   no dynamic lighting). A player's and the table display's view of the fight leave out what lies
   in hidden squares — the creatures there (from the order too: a hidden creature's turn shows as
   the DM's), their terrain — except the party's own; the DM sees the fog as a veil.
5. **Measuring, templates, pings and drawing.** Anyone measures on their own board (every square
   5 feet, diagonals too, as the rules count) and lays a spell's area — sphere, cube, cone, line,
   emanation — to see the squares it covers; the geometry is the rules' own, shared through
   contracts. Marks the table shares — a ping that fades, the DM's pointer, strokes until cleared,
   a placed template — are kept beside the world for the live session (ADR 0033: the stream only
   says something changed, and each screen reads the marks again); the DM always marks, players
   when the DM allows, and the DM clears them.
6. **Traps and hazards on the board.** The DM sets an SRD trap (ADR 0055 §3) on squares, hidden or
   seen; a creature that enters a trap's square stops there and the trap is sprung on it as
   `SpringTrap` springs it. A trap is found by a passive Wisdom (Perception) at or above its DC as a
   creature comes near, or by the Search action; Utilize with thieves' tools disarms it (a Dexterity
   check against its DC; a failure by 5 or more springs it). Hidden traps are the DM's to see. A
   hazard square (fire, acid, a poison cloud) harms a creature that enters it or starts its turn in
   it, with the save the DM set.
7. **Loot, treasure, the party's stash and coins.** A creature may carry items (the DM gives them,
   as to a character); the party takes what a fallen foe carried. The DM leaves treasure at a place
   (items and coins lying there, ADR 0039). The party has one stash any member gives to and takes
   from. Coins are split evenly among chosen members with change made (1 PP = 10 GP = 20 EP =
   100 SP = 1,000 CP), what does not divide staying where it was.
8. **Merchants.** The DM makes an NPC a merchant with a stock (catalog entries, how many, a price
   factor). A character buys at the price and sells at half the item's value, trade goods, gems and
   art at their full value (SRD "Selling Equipment"); coins and items change hands at once, change
   made, through the World Engine.
9. **Crafting.** A character proficient with the tool an item needs crafts it: raw materials worth
   half its cost (rounded down) are spent at the start, and it takes its cost in GP ÷ 10 days of
   8 hours (a fraction a day), shared among those who help (one helper unless the DM allows more).
   A Potion of Healing needs the Herbalism Kit, 25 GP and one day; a Spell Scroll needs Arcana or
   Calligrapher's Supplies, the spell prepared, and its level's days and cost. A project is a world
   fact; days of work are given by the DM (downtime) and the finished item appears in the crafter's
   pack.
10. **The world map and travel.** A region's map (made by GPT or uploaded) carries pins: the places
    it shows, set by the DM. Routes join places with their miles, terrain and whether a good road
    runs. The DM moves the party along a route at a pace (Fast 4 miles an hour, Normal 3, Slow 2;
    the terrain's maximum pace, one step more on a good road, Slow when a member's Speed is halved):
    the world's clock advances by the hours it takes, the travellers arrive, and each hour past 8 in
    a day asks each traveller a Constitution save (DC 10 + 1 per hour past 8) or a level of
    Exhaustion. The pace's effects on checks show in its words.

## Notes from the implementation (Stage 670a, 2026-11-03)

- Saved encounters (`apps/server/src/combat/saved-encounters.ts`; the store beside the world
  `saved-encounter-store.ts`, `postgres-saved-encounter-store.ts`, migration 0034): up to 60 a
  campaign, the DM's alone in the ADR 0009 order. A foe is a bestiary entry or one of the campaign's
  creatures at a square; an unknown place, foe or a square off the field is refused with its reason.
  The list gives each its foes (name, Challenge Rating, XP, size), its difficulty for the party at
  its place now, and what keeps it from starting: a fight running, a creature that can no longer
  fight, nobody of the party there, or its place or a creature gone from the campaign (an undone
  creation): such a one stays listed — it holds one of the 60 places — to be changed or deleted.
  The workshop's prepared encounters stay listed above them.
- The builder (`apps/web/src/combat/encounter-builder.tsx`, `encounter-layout.ts`): foes found by
  name or type and counted, or taken from the campaign; their squares laid out from the right edge
  by size, a square apart, never past the middle; the party on the left edge every other row; a
  field of 8 to 40 squares a side. The server weighs the foes as they change
  (`POST …/encounters/difficulty`). A new encounter keeps one id while the builder is open, so a
  save retried after a lost answer changes the same one.
- Starting one (`POST …/encounters/saved/:id/start` with a request id): each bestiary foe made
  (`CreateEntity`, `SetStatBlock`), numbered when several share a name ("Goblin Warrior 1"), the
  campaign's creatures brought to the place, and the fight begun with the saved field and squares
  and the party there. The command ids follow from the encounter and the request: a retry starts it
  once; a second start while the fight runs is refused.
- `PlaceCombatant` (`packages/combat/src/board-hand.ts`) is the DM's: any combatant set down on a
  free square of the field, its turn untouched; a mount carries its rider, a rider alone is refused
  (`MOUNTED`), its own square changes nothing; set down out of its grappler's reach, a creature is
  held no longer, as a shove ends it. The DM's history says it was set down.
- The DM's hand (`apps/web/src/combat/dm-hand.tsx`, `board/token-drag.ts`): a combatant chosen by
  its square, figure or name plate, then a free square, offers "Set it down here" and, on a
  creature's own turn, the ways there by its Speed (`MoveCombatant`). A press on a token or its
  plate that moves 8 px is a drag and its drop the same command; the mouse's click after a drop is
  swallowed wherever it lands, and a drop on the token's own space sends nothing.
- The turn order keeps a numbered combatant's number beside its Initiative total: two Goblin
  Warriors are told apart by the DM too.

## Notes from the implementation (Stage 670b, part 1, 2026-11-03)

- `PaintTerrain` (`packages/combat/src/terrain-paint.ts`) is the DM's: squares (at most 400 a
  stroke) and one paint — a wall, difficult ground, a cover level, water shallow or deep, the
  ground's height (0 lays it level), light or heavy obscurement, or a clear. The event
  `TerrainPainted` carries the stroke, and the history replays it through one pure function
  (`packages/contracts/src/combat/terrain-paint.ts` `paintBattlefield`, shared with the encounter builder): a paint replaces its own kind on
  its squares, a wall replaces everything there, anything else takes a wall away, a clear leaves
  the squares bare; a square's light is the fight's and stays. Every square lies on the field; no
  wall rises where a creature or an object stands; a stroke that changes nothing (`NO_EFFECT`), or
  would pass a battlefield's lists, is refused. The rules read the painted ground at once (a wall
  stops a move); players see it as the DM does.
- The brush on the board (`apps/web/src/combat/paint-card.tsx`, `board/paint-stroke.ts`): the
  DM's "Paint the ground" beside the board's view controls opens the brush card; a press paints a
  square (Enter or Space on a focused one too), a press that moves 8 px paints every square the
  pointer passes as one stroke, and Escape or Done puts the brush down. While it is on, a press
  chooses nothing and no token is dragged. The DM's history names each stroke ("Difficult
  terrain: 3 squares").

## Notes from the implementation (Stage 670b, part 2, 2026-11-03)

- The builder's battlefield (`apps/web/src/combat/encounter-field.tsx`, `builder-layout.ts`): the
  saved encounter's ground and every token's square are the builder's to set. The board opens flat
  from above, its view and brush buttons above the grid (never over a corner where a foe starts);
  the same brush paints the ground before the fight (`paintBattlefield`, now in contracts, so the
  builder and the World Engine lay the same ground); a foe or a party place moves by choosing it and
  a square, or by dragging it. Laid out from the edges until moved, a moved token keeps its square
  while the builder is open and in the saved encounter (the n-th foe of its kind, the n-th party
  place). A smaller field leaves its ground beyond the edge behind.
- Saving is refused, on the screen and by the server, while a token stands off the field, in a wall
  or on another's square (`layoutProblem`; the server's reason `square`), each said in words.

## Consequences

- Stage 670 runs in parts (`work-orders/STAGE_670.md`): the builder and the DM's hand; terrain and
  battle maps; fog, measuring and shared marks; traps and hazards; loot, the stash and coins;
  merchants and crafting; the world map and travel.
- New world facts and commands each carry footprints and undo as the kernel requires; the stores
  beside the world (encounters, marks) are the DM's or the table's, outside the history.
- Players' views stay built field by field: fog and hidden traps are filtered by the server, never
  hidden by the client.

## Invariants affected

Preserves 1, 8 and 9: every change to the world and the fight goes through the World Engine, which
rolls every die; a player sees only what their character could (fog, hidden traps, the DM's
encounters and marks policy).
