# Stage 1160 — the fight run from the map

Authorized by the owner on 2026-11-25: «Реализуй весь план до конца»
(`reviews/OWNER_BOOK_SECOND_PASS_2026-11-25.json`, `docs/BOOK_SECOND_PASS_PLAN.md`). The plan's
words for this step: «Бой — раскладная карта. Поле и действия вместе, ход за любого по нажатию на
фигурку. Правила не трогаю, меняю только способ управления». ADR 0075 §17. Stacked on
`claude/stage-1150-working-spread` (pull request 98).

## Why

Read in the running product: a DM ran a fight from two tabs — the field on "Scene", every action
on "Encounter", where the field is not seen. On the owner's tablet (1024×768) the fight was one
scrolling column: the place's card, who is at the table, the switch, whose turn it is and the
order of turns stood above the map, which began two thirds down the screen. Taking a hero's turn
meant the Encounter page, a reason, and "Stop acting" afterwards. A hero nobody plays could not
be run by the DM at all: the reason is kept only for a character who has a player, and the client
refused the turn without it.

## Scope

- **A tablet's fight is a fold-out too** (`styles/fold-out.css`, `combat/fold-out.ts`): from
  768 px wide and 501 px tall the fight is on the book's paper and fits the page — the order of
  turns at the head with the fold's handle at its end, the map as large as its squares go, the
  active combatant and the card of what is chosen in the right margin, the turn tray or the DM's
  slip at the foot. Nothing scrolls the stage. The place's card and who is at the table step
  aside there (the order of turns shows everyone's hit points); whose turn it is is said in the
  order of turns, and apart only to the one it calls ("Your turn"). A phone keeps its column.
- **The DM's turn slip at the fold-out's foot** (`combat/dm-turn.tsx`, mounted by
  `dm/dm-sheets.tsx`): whose turn it is; for a creature the suggested turn in the table's
  language and "Make this move" (the exact command the server proposes); for a hero "Take the
  hero's turn", and "Answer for …" when a reaction waits on one; an open reaction window's own
  card; "The whole Encounter page" (the turn order's tools, the light, what joins a fight); "End
  the fight", asked once on the map. Every action is one the Encounter page already had.
- **A hero's turn taken from the map ends with it** (`combat/stand-in.ts`): the DM sees that
  hero's own tray on the same map, and when the hero has nothing more to do now the DM's own
  view comes back by itself. It is kept in the DM's history as "a turn taken from the map"; the
  reasons a player is stood in for (absent, asked) stay on the Encounter page, with "Stop acting".
- **A hero nobody plays is the DM's to run** (`exploration/use-action.ts`): the server keeps a
  reason only for a character who has a player and answers 422 for anyone else, whom "the DM
  simply runs" (`apps/server/src/dm/dm-routes.ts`); the client now goes on with the command
  there instead of refusing the turn.
- **A creature's suggested turn in the table's language** (`combat/suggestion-words.ts`), on the
  slip and on the Encounter page: the server's sentence is English only, so an English table
  reads it and every other table reads what the suggestion's own command says.
- A result lies above the slip, and wide, the map ends above it (its height is kept as
  `--turn-h`).

Unchanged: every command, rule, route and contract; a player's fight on a phone; the board's
drawing; the Encounter page (it gains nothing and loses nothing but the English sentence in a
Russian table).

## Journeys

- `tests/e2e/fight-from-map.spec.ts` (Chromium and the iPad project; campaigns
  `ui-combat-map-ru`, `ui-combat-map-ipad-ru`): the slip in view with nothing covered, the
  fold-out fitting the page, a hero's turn taken and given back, a creature's suggested turn, the
  Encounter page one press away, the fight ended from the map; a player without the slip.
- Every other journey runs unchanged.

## Known limits

- "Press a figure to act" is the DM's hand as it was (a figure, then a square, moves it); the
  turn's actions are on the slip, not in a bubble beside the figure.
- A creature's own actions with a save, its legendary actions and a readied attack stay on the
  Encounter page.
- A tablet held upright (768–1023 px wide) gets the same fold-out with a narrower map.
- The history says "another reason: a turn taken from the map" for such a turn; it does not say
  whether the player asked.

## Out of scope

The Party's and the Table's pages by tasks, the table's screen, the shelf, a player's phone, new
book materials (Stages 1170–1210). Merging and deployment stay the owner's.
