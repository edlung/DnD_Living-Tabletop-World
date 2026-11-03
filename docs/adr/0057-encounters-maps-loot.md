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

## Notes from the implementation (Stage 670b, part 3, 2026-11-03)

- The DM's own battle map (`apps/server/src/images/battle-map-upload.ts`, the place's Images panel
  `apps/web/src/images/battle-map-tools.tsx`): a PNG, JPEG or WebP of up to 10 MB for a place with
  an approved picture (a battle map derives from it, as every battle map does), re-encoded in its
  own shape and approved through the lineage under command IDs that follow from the request — the
  DM's request and approval, the server's start and completion for the asset worker (generator
  `upload`); the running worker never starts such a request, so no image model is asked for it. It
  supersedes the place's battle map before it. A retried upload changes nothing twice.
- `AlignBattleMap` (DM) records a battle map's grid on its picture: a cell's size and its first
  whole cell's corner in the picture's pixels, its columns and rows (at most 40 a side). Visual
  state, never a world fact; shown to players with the picture; undone as any DM command. The
  editor draws the grid over the picture and counts the whole cells.
- The board draws a lined-up map at the squares' scale from its first cell's corner (the ground
  clips what lies beyond the field); a fight started with who is at the place takes the grid's
  columns and rows. A generated map without a grid is stretched over the field as before.
- Undo of `PaintTerrain` (part 1) restored nothing until this part: the undo restores now name
  every event type (`never` in `packages/domain/src/kernel/decide/undo.ts`), so an event left out
  fails to compile instead of undoing silently.

## Notes from the implementation (Stage 670c, part 1, 2026-11-03)

- `SetFog` (DM; `packages/combat/src/terrain-paint.ts` `decideSetFog`) lays the fog of war on
  squares of the running fight or lifts it (`FogSet`, the battlefield's `fog`, replayed by
  `fogBattlefield` in contracts; undone with the fight). The builder lays it before the fight with
  the same brush ("Hide in the fog of war", "Reveal from the fog"), and a saved encounter starts
  with it.
- What it hides is decided once, in the domain (`packages/domain/src/combat/fog.ts`
  `hiddenByFog`): a combatant not of the party's side and commanded by no one whose whole space
  lies in fogged squares. Perception leaves such a creature out (`perceivedEntityIds`), so every
  view built on it — targets, area previews, the scene — leaves it out too; the encounter view of a
  player, the party and the display leaves out the creature, its place in the order (its turn shows
  as `HIDDEN_TURN`, "The DM's turn") and the ground under the fog, and keeps where the fog lies.
- On the board the players and the display see the fog as darkness ("in the fog of war" in the
  square's name); the DM sees a veil with the figures above it.
- The fog only ever takes perception away, so a command legal under it is legal without it. Fight
  commands read the fight (`facts.encounter()`), so undoing a reveal that a later attack relied on
  is refused; an out-of-fight command's perception premise does not read the fog — undoing a reveal
  is not refused by a later inspection of the revealed creature at the same place (an accepted
  limit: inspections during a fight are rare, and the DM sees the history).

## Notes from the implementation (Stage 670c, part 2, 2026-11-03)

- The board's geometry is shared through contracts (`packages/contracts/src/combat/geometry.ts`:
  `squareDistanceFt`, `inSpellArea`, `squaresInArea`); the rules re-export it unchanged.
- Every viewer's board has a ruler and a spell's area (`apps/web/src/combat/board-tools.tsx`),
  on that screen only: the ruler's start and end are pressed, the line follows the pointer or the
  keyboard until its end is set, and every square's name says how far it lies from the start; the
  area — a sphere or cube at a point, a cone, line or emanation from the viewer's own character (the
  DM's: the combatant chosen last) — marks the squares the rules count in it, and the card says how
  many. While a tool is in hand a press serves it and no token is dragged.

## Notes from the implementation (Stage 670c, part 3, 2026-11-03)

- The table's marks live beside the world (`apps/server/src/marks/`, migration 0035) and are read
  through `GET /campaigns/:id/marks` by every member and the paired display; the live inventory
  covers the view for an acting character, the DM and the display. The DM lays pings, the pointer
  (one, moved by pointing again), strokes and shown areas; a player lays pings, strokes and areas as
  their character when the DM allows (`POST …/marks/settings`); the DM clears them all, and a mark
  is removed by its author or the DM. At most 60 marks a minute a person, 200 a campaign.
- Each mark belongs to the run of the fight it was laid on — the event ID of the fight's
  `CombatStarted` — so a fight that ends takes its marks from every board, and the same saved
  encounter fought again begins with none; the next mark sweeps the earlier fight's. Outside a
  fight no mark is laid (409), nor off its field (400).
- A ping fades after 4 seconds by the server's clock (the view drops it, and the stream signals
  that) and by each screen's own clock from when it first read the ping, so a screen whose clock is
  off still shows it for its 4 seconds. The newest mark is said once in words for assistive
  technology (`role="status"` on the board), and a square's name says where the DM points.
- On the board a mark is a tool like the ruler (the "Mark the board" control): a press pings or
  points, a drag in "Draw" mode lays a stroke; a laid spell's area is shown to the table from its
  card. A stroke has no keyboard path of its own (freehand drawing); a press on a square, and the
  area shown from the card, are the keyboard's marks.

## Notes from the implementation (Stage 670d, part 1, 2026-11-03)

- Traps and harmful ground are the battlefield's (`traps`, `hazards`), laid with the DM's brush on
  a running fight (`PaintTerrain` with `trap` or `hazard`) and in the builder: one trap a stroke,
  over all its squares (64 at most), at a tier the trap has; a wall or a clear takes either away.
  The board's traps are the Toolbox's but the Poisoned Needle, which waits in a lock.
- Each trap's own words decide (`packages/rules/src/toolbox/traps.ts`, held to the SRD's text): how
  it is found (a Search's Perception, which a Passive Perception also meets, or a Study's
  Investigation, at its DC), whom it catches (the collapsing roof, the statue's cone and the darts
  every creature on the trap; the net, the stone and the pits the one that set them off), whether
  it resets (the statue at each later turn, the darts until they have fired three times), and what
  it leaves (the roof's rubble as Difficult Terrain, a pit open as a pit of its depth).
- A creature whose space comes onto an armed trap at ground level stops there and springs it
  (`TrapChanged`, then each caught creature's save and harm through the Toolbox's `sprung`); before
  any reach it would leave further on, so no opportunity attack is offered past a trap. A step in
  flight or in a jump touches nothing. The statue springs too on a creature that starts its turn
  on it. The mover's outcome names the trap ("A trap springs: Hidden pit.") with its fall.
- Harmful ground harms a creature whose space comes onto a square of it, once a square a move, and
  one that starts its turn on it, once a kind: the save the DM set, then the damage, none or half
  on a success.
- A hidden trap is the DM's until found or sprung: the players' and the display's views leave it
  out, and under the fog of war they see neither traps nor harmful ground. On the board a trap's
  squares are outlined with its mark in a corner — gold while hidden, red in sight, dotted once
  spent or disarmed — and its words are in the square's name and the terrain card.
- `TrapChanged` restores the encounter on undo, as every battlefield event does.

## Notes from the implementation (Stage 670d, part 2, 2026-11-03)

- Finding follows each trap's words, not one rule for all: a Search trap (the roof, the net, the
  statue's plate, the darts) is found by a Search's Wisdom (Perception) at its DC, and noticed by a
  creature of the party whose Passive Perception meets the DC as its space comes within 5 feet —
  the move then stops short of it when the rest would come onto it; a Study trap (the pits, the
  stone's plate) only by a Study's Intelligence (Investigation). Both act within 5 feet. The party
  finds it once for all its members.
- Disarming follows the SRD's words too, where §6 above named the older thieves' tools check: each
  board trap is made safe without a check once found — the wire cut, the holes plugged, the glyph
  defaced, a spike under the plate or the lid — so Utilize on a known trap's square within 5 feet
  disarms it, with the Action. Utilize on a square with a hidden trap is refused as on one with
  none (`NO_KNOWN_TRAP`), so nothing tells them apart. The item the words name (an Iron Spike, a
  sharp tool, wax or cloth) is the player's to narrate; it is not taken from the pack.
- The player's square card names a known trap and offers "Disarm the trap" on their turn within 5
  feet; the route the board suggests keeps clear of known traps (a trap's square only as the end)
  and, at the same cost, of harmful ground — advice, the World Engine decides. The mover is told
  what it noticed ("You notice a trap: …"), and a Search, a Study or Utilize what it found or
  disarmed.

## Notes from the implementation (Stage 670e, part 1, 2026-11-03)

- Creatures carry items: the DM gives one from the catalog on the creature's card in a fight (with
  what it carries listed), as to a character. When a fight ends, what each creature or NPC that
  fell in it carried, unworn, lies where the fight was (`ItemTransferred` to no one, then
  `EntityPlaced`, in the `EndCombat` decision) — the place's things, taken as anything lying
  there; nothing moves while the fight runs. A worn item stays on a fallen NPC.
- Treasure: `GrantItem` to a place leaves the item lying there (`ItemGranted` with no holder, and
  `EntityPlaced`); the DM leaves it from the Encounter sheet ("Leave treasure here"). The party
  sees a thing lying there as an unknown item until they look at it or take it, as before.
- The party's stash is a holder of its own, `PARTY_STASH` (`@ltw/contracts`), no entity and no
  place: a member gives to it what it carries unworn (`GiveItem`, all of a stack or part, no turn),
  and any member takes a whole stack from it (`TakeItem`), wherever they are, outside a fight.
  Every member's inventory lists it; someone outside the party neither gives to it (refused) nor
  takes from it (refused as for a thing not there).

## Notes from the implementation (Stage 670e, part 2, 2026-11-03)

- A member of the party, for the stash and for coins, is a character — as a fight takes the
  characters at a place for the party — whether or not a player sits in its seat; NPCs and
  creatures are not.
- `SplitCoins` (a player's, for the character's own coins): each coinage the character carries —
  Ravenford's crowns, marks and pennies, and the SRD's platinum to copper — is pooled in copper and
  split evenly among the members named who are here (the character too, when named), each share
  paid in the largest coins and never in electrum (`packages/contracts/src/items/coins.ts`); what
  does not divide stays with the character, and a coinage worth less than a copper each is left as
  it is. The character's old stacks of that coinage are spent (`ItemStackChanged` to 0, then
  destroyed) and the shares minted anew, a stack a coin (up to 42 IDs drawn by the engine). Stacks
  minted so may hold more than a grant's 99. Outside a fight; someone not here, not a character or
  not standing is refused as not present.
- The pack offers "Share the coins out" to a member: who shares (everyone here, the character too,
  until unticked) and what each gets, line by line, before anything moves.

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
