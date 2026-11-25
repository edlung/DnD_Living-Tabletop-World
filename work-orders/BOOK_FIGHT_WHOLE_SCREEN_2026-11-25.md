# The fight is the whole screen

The owner, 2026-11-25, on the book set closer to the concept (pull request 107): «Бой не должен
быть мелким. Сделай его на весь экран.» — the first of the interface's loose ends he asked to
have finished before the other books' materials are drawn
(`reviews/OWNER_BOOK_LOOSE_ENDS_2026-11-25.json`). ADR 0075 §26. Stacked on
`claude/book-closer-to-concept` (pull request 107).

## Scope

- **One sheet the map takes** (`styles/fight-whole.css`, from 701 × 501 px, the DM's book and a
  hero's): the fold-out never scrolls; a square grows to 160 px (`combat/board/board-view.ts`
  `MAX_CELL`); the order of turns is a column at the map's left where the sheet is wider than
  tall and a row of faces at its head where it is not (`ORDER_COLUMN`,
  `combat/hud/initiative-strip.tsx`).
- **The head row**: the fold's handle at its end, "Your turn" in its middle, the DM's quiet
  switch at its start; under a page opened over the fight.
- **A foot of constant room**: a player's tray or the DM's slip at the sheet's foot; what needs
  more rises over the map's foot, the map keeps its size.
- **Cards over the map's edge**, on the side away from what is chosen (`combat/combat-panel.tsx`
  `data-far`); how to read the board behind a board tool (`board/board-controls.tsx`,
  `data-legend`); each on the fold-out's paper.
- **Spare room taken by the cards** (`combat/board/spare-room.ts`, `styles/fight-cards.css`):
  the board says what room it leaves — beside itself (a margin at the map's right: the active
  combatant, the card, who is at the table) or under itself (a tablet held upright). With none,
  the active combatant's card is said and not shown, and the card of a chosen combatant tells
  what its conditions do and how they end (`combat/hud/side-panel.tsx`).
- **A hero's fight laid as the DM's** from a tablet up (`styles/book-shell.css`,
  `styles/book-whole.css`: the bookmarks along the bottom and the clasp among them are a
  phone's).
- **What the table asks and a result** placed clear of the board's tools and of the foot; the
  slip that says the DM acts for a hero in one row.
- **The book's layouts from 701 px** in the sixteen stylesheets that still switched at 768 px.
- **The journeys**: the turn order, not the anchor's box, is what must stay in reach
  (`tests/e2e/turn-hint.spec.ts`).

## Out of scope

A phone's fight and the table's screen; the board's hit-testing, tools and names; the cards'
own content; every command, route and contract; merging and deployment.

## Acceptance

- At 766 × 799 the DM's map is at least 600 px wide (it was 510); at 1024 × 768 at least 680;
  a player's at 766 × 799 the sheet's whole width.
- Choosing a square or a combatant never changes the map's size or place.
- Nothing of the sheet lies under another part or is cut at 766 × 799, 1024 × 768, 1280 × 720,
  1440 × 900 and 834 × 1194; a phone's fight is as it was.
- Static checks, unit tests and the journeys pass; the layout audit of the fight's states is
  clean.
- Every new phrase of the interface is listed for the owner (there is none: «Как читать поле»
  names the board's new tool and was the legend's heading).
