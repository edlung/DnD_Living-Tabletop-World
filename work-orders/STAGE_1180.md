# Stage 1180 — the table's screen

Authorized by the owner on 2026-11-25: «Реализуй весь план до конца»
(`reviews/OWNER_BOOK_SECOND_PASS_2026-11-25.json`, `docs/BOOK_SECOND_PASS_PLAN.md`). The plan's
words for this step: «Экран стола. Книга во весь телевизор, поле боя на всю высоту, обложка
вместо бежевого прямоугольника». ADR 0075 §19. Stacked on `claude/stage-1170-pages-by-tasks`
(pull request 100).

## Why

Read on a paired screen at 1920 × 1080 in the running product: in a fight the order of turns lay
across the top and the battlefield took about a quarter of the television; the rolls' page with
no roll yet, and the way in while the table is closed, were an empty beige sheet with one line;
a title page of a family story showed the game's dark castle; words read aloud stood on a dark
veil over their picture, not on a page of the book.

## Scope

- **A fight on a screen wider than tall** (`styles/display-spread.css`): the order of turns is a
  column at the left, the battlefield beside it at the screen's height. Every row is one portrait
  high; the column steps down for nine to twelve and thirteen to sixteen combatants so that all
  stand whole; a longer order keeps whoever acts in view (`display/cast-views.tsx`, `Battle`).
  The number on an unnamed creature's portrait is larger. Whom the table waits for moves from
  the foot at the left to the head of the map, beside the column.
- **A quiet page is a spread**: the rolls' page with no roll, and the way in of a table not open,
  show the book's emblem on the left page and their words on the right one.
- **A title page takes the book's emblem** when the book has one (`TitleCard`'s `emblem`, read
  with `bookPiece` in `display/display-app.tsx`): on the left page of a paper spread, above the
  title on the cover. A book without its own emblem keeps the game's key art.
- **Words read aloud lie on the book's paper** at the foot of their picture, in the page's ink.

Unchanged: every cast's contract and content, what a screen is sent, the server. The players'
"Table screen" online (`online/shared-screen.tsx`) is given no emblem and keeps its looks. An
upright screen keeps the order of turns above the map.

## Journeys

- `tests/e2e/table-screen.spec.ts` (Chromium; sign-in campaign `screenBook`): a login starts «Маяк
  Между Ветрами», pairs a television at 1920 × 1080; the quiet spread with the book's emblem, the
  Chronicle's empty title page with the emblem and no key art, the way in of a closed table, the
  words read aloud on paper with their contrast; axe on two of them.
- `tests/e2e/display-room.spec.ts`: in the fight the map stands beside the column at more than
  85 % of the screen's height, the waits beside the column, every row whole and of one height.

## Known limits

- On a flat board (a screen under 1200 px wide) a name plate at the map's edge reaches past it
  and that edge fades, as before this stage.
- An order of more than sixteen scrolls in its column; whoever acts is brought into view.
- Fifty-two library campaigns have no emblem of their own yet: their title pages keep the game's
  key art and their quiet spreads show the product's emblem (Stage 1210 draws three sets on
  trial; the rest wait for the owner's look).

## Out of scope

The shelf, a player's phone, new book materials (Stages 1190–1210); the television shell's
remote. Merging and deployment stay the owner's.
