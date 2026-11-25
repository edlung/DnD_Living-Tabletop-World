# The fight is the whole screen — report (2026-11-25)

Work order `work-orders/BOOK_FIGHT_WHOLE_SCREEN_2026-11-25.md`; ADR 0075 §26; the owner's words
`reviews/OWNER_BOOK_LOOSE_ENDS_2026-11-25.json`. Branch `claude/book-fight-whole-screen`, stacked
on `claude/book-closer-to-concept` (pull request 107). Status: **implemented; nothing is merged
or deployed.**

## Why

The owner, on the book set closer to the concept: «Бой не должен быть мелким. Сделай его на весь
экран.» In his own window (766 × 799) the map kept 510 of the sheet's 650 px, beside a column of
cards; on a tablet held wide, about half of the sheet. It is the first of the interface's loose
ends he asked to have finished before the other books' materials are drawn.

## What changed on the screen

| Before                                                                                          | Now                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The map between a left column (place, whose turn, active combatant) and a right column of cards | One sheet the map takes; only the order of turns stands beside it                                                                                                                                                                  |
| A square no larger than 72 px                                                                   | A square up to 160 px: the map fills the sheet it is given                                                                                                                                                                         |
| The order of turns a row across the top at every width                                          | A narrow column at the map's left where the sheet is wider than tall; a row of faces at its head where it is not                                                                                                                   |
| The card of what is chosen in the right column                                                  | Over the map's edge, in the half its subject is not in; it closes with its cross or Escape                                                                                                                                         |
| How to read the board always in the right column                                                | Behind one of the board's own tools («Как читать поле»); always shown where the sheet has room to spare                                                                                                                            |
| A tablet's map changed its size when the turn tray grew (a target chosen)                       | The foot keeps a constant room: the map keeps its size and its place under the pointer                                                                                                                                             |
| A hero's fight on a tablet: the bookmarks along the bottom, the clasp among them                | Laid as the DM's: the bookmarks at the fore-edge, the map across the sheet (the phone keeps its own)                                                                                                                               |
| What the table asks («Сессия ещё не началась», a check) lay over the board's tools              | On the map's head at its left, clear of the tools                                                                                                                                                                                  |
| "You are acting as …" above the book in two or three lines                                      | One row (its second sentence is still read to a reader of the screen)                                                                                                                                                              |
| An upright tablet: the map on top, half a page of empty paper under it                          | The active combatant and the card (or how to read the board) under the map, side by side                                                                                                                                           |
| The active combatant's card always in the left column                                           | In a margin beside the map where the map leaves 300 px (a laptop, a tilted board), with who is at the table; else said to a reader of the screen, and the card of a chosen combatant tells what its conditions do and how they end |
| A phone's fight said whose turn it is twice (a plate, then the words under the order)           | Once: the plate is for the one it calls («Ваш ход»); the map comes up a row                                                                                                                                                        |
| Sixteen stylesheets switched to a phone's rules under 768 px                                    | Under 701 px, as the book's own layouts do: a window 701–767 px wide no longer mixes the two                                                                                                                                       |

The map, measured (the test copy of «Маяк Между Ветрами», a map of 10 × 8 squares):

| Screen                                 | Before    | Now                                         |
| -------------------------------------- | --------- | ------------------------------------------- |
| The DM, 766 × 799 (the owner's window) | 510 × 405 | 610 × 488                                   |
| The DM, 1024 × 768                     | 540 × 430 | 680 × 544                                   |
| The DM, 834 × 1194 (a tablet upright)  | —         | 690 × 552, the sheet's width                |
| The DM takes a hero's turn, 766 × 799  | —         | 530 × 424 (the acting row and the tray)     |
| A player waiting, 766 × 799            | —         | 630 × 504, the sheet's width                |
| A player waiting, 1024 × 768           | —         | 740 × 592                                   |
| The DM, 1440 × 900 (the board tilted)  | —         | 860 × 590: the tilted table's own head room |

## Found on the way

- **The journeys caught three faults of the first cut**, each a real one: the fold's handle lay
  over the Close button of a page opened over the fight (the DM could not close «Вся схватка»);
  the map changed its size when a target was chosen, so a pointer aimed at a name plate missed
  it; and who is at the table was gone from a laptop's fight. All three are in §26 now as rules
  (the head row under an opened page; a foot of constant room; the margin of a wide window).
- **The second run caught a fourth**: at 1440 × 900 the active combatant's card — the one place
  that said what a condition does and how it ends — was gone with the right column. A media
  query could not say where a card fits: the same window has room beside a tilted map and none
  beside a flat one. The board now says what room it leaves, and the cards take it.
- **A card of words alone must not scroll**: how to read the board has nothing to focus, so a
  scroll box around it failed the accessibility check. It is never cut — a margin too short for
  it keeps the board's tool instead.
- **A phone's rule reached a 766 px window** (`max-width: 767px` in the rest's stylesheet left an
  empty band under the map): the reason for moving every such threshold to 700 / 701 px.
- **An edit in two writes showed an error page in the open tabs** (the usage saved before its
  import, hot-reloaded between them). Not a product fault; source edits are made in one write.

## New phrases of the interface

None. «Как читать поле» was the legend's heading and now also names the board's tool that opens
it.

## Files

New: `apps/web/src/styles/fight-whole.css` (the sheet), `fight-cards.css` (where the cards lie,
their paper); `apps/web/src/combat/board/spare-room.ts` (the room the map leaves).
Changed: `combat/board/board-view.ts` (`MAX_CELL`, `ORDER_COLUMN`), `board/board.tsx` (the
largest square; the room left under the map), `board/board-controls.tsx` and
`combat/combat-panel.tsx` (the tool for how to read the board; the card's side),
`combat/hud/initiative-strip.tsx` (the order scrolls down in a column), `combat/hud/side-panel.tsx`
(a chosen combatant's conditions: what each does, how it ends), `world/combat-stage.tsx`
(the fold's handle's words apart from its marks); `styles/fold-out.css` (the tablet's and the
wide screen's own blocks give way), `book-shell.css` and `book-whole.css` (a hero's fight with
the bookmarks along the bottom is a phone's), `board.css`, `phone-head.css`; the 700 / 701 px
threshold in `ritual`, `pause`, `stars`, `shared-screen`, `ending`, `story-cast`,
`sheet-layouts`, `rules`, `rest`, `guide`, `figures`, `dm-screen`, `comforts`, `broken`,
`book-foot`, `book-details`; `tests/e2e/turn-hint.spec.ts`.

## Verification

- **Static**: format, lint, typecheck, the context budget (two stylesheets, 449 and 204 lines).
- **Unit**: 5,139 of 5,139.
- **Journeys** (Chromium 1280 × 720 and the iPad project, WebKit): the fight's set — attack
  reactions, the battle map, plates, board tools, areas, the pointer, reactions, the lifecycle,
  the narrow fight, turns, commanded creatures, conditions, encounters, the fight from the map,
  live combat, stand-in, marks, mounts, opportunity attacks, the turn hint — with accessibility,
  the pause, the DM's screen, a phone's layout and the table's screen: 90 of 91 on the last whole
  run of the set, the one failure (the active combatant's card at 1440 × 900) fixed and re-run
  with its neighbours, 24 of 24. A new journey holds the stage's point: at 766 × 799 the map
  takes the sheet and stands still while a figure is chosen (`fight-from-map.spec.ts`). The whole
  suite was not run locally for this stage; the pull request's checks run it.
- **Layout audit** (the skill's `audit.mjs` on each state): the DM's sheet, a chosen figure's
  card, the DM taking a hero's turn, a creature's turn, a player's own screen — at 766 × 799,
  1024 × 768, 1440 × 900 and 834 × 1194, and a player's phone at 390 px: clean. The audit learned
  one thing on the way: text inside a box clipped to 1 px for a reader of the screen is hidden on
  purpose (the skill's `audit.mjs` and `SKILL.md`, outside the repository).
- **Not verified**: a real tablet in the hand; a fight with more than a dozen combatants in the
  order's column (it scrolls, with faded edges, as the row did); maps much wider than tall on a
  phone held wide (the phone's own layout, unchanged).

## Left for the next stages

The result of an action and what the table asks are still dark glass over the sheet; they are
the first things of the next stage (every card, slip and dialog on the book's paper).
