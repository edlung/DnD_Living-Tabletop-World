# Stage 1100 completion — the shelf

Work order `work-orders/STAGE_1100.md`; program `docs/BOOK_INTERFACE_PLAN.md`; ADR 0075 §10;
2026-11-23. Status: **implemented; not merged, not deployed**. Branch `claude/stage-1100-shelf`,
stacked on Stage 1090's.

## What changed

- **The way in is the product's book lying open** over the key art (`styles/way-in.css`,
  `session/sign-in-screens.tsx`): the ex libris on the left page with the emblem, the wordmark and
  the tagline; signing in, an invitation, a table's code, a failed link and signed out on the right
  page. Below 900 px the book is one page and the plate's words head it.
- **The hub is the shelf** (`styles/shelf.css`, `session/hub.tsx`, `hub-campaigns.tsx`,
  `shelf-book.tsx`): the product's bookcase behind; each campaign a book face-out in its own
  campaign's binding on a stretch of the bookcase's board, a paper label below in its campaign's
  paper — its name, who the account is there, **where the party is**, the next game, its book and
  its door. Finished adventures, the ready adventures and the library are shelves of the same kind.
- **The library**: each campaign a book with its cover picture set into the binding; "Look inside
  the book" opens its first page over the shelf (`session/library-look.tsx`) with the whole pitch,
  the party size and Start. Escape or Close puts it back and returns focus to the label.
- **The account is a page** of the product's book after the shelves, reached in one step from the
  shelf's head ("Your account"); the form moved to `session/account-settings.tsx`.
- **The privacy notice and "something went wrong"** are pages of the same paper.
- **Where the party is**: `GET /account` lists `place` for each campaign — the name of the place
  the table's screen would show, only when the party knows it (`accounts/accounts.ts`
  `placeOf`, the contract's optional `place`). No command, rule or projection changes.
- **Every campaign's book set is shipped**: 55 campaigns and the product's own (56 books, 10 MB of
  WebP), Codex CLI pictures from `~/Documents/living-tabletop-world-art/book-sets-2026-11-23/final`,
  with the product's bookcase, its board (cut from the bookcase by `scripts/book-materials/build.ts`
  without changing a pixel) and the ex libris. Every campaign's paper is lighter than the product's
  (measured luminance 0.66–0.92 against 0.60), so dark ink keeps its contrast on all of them.
  Ash Tithe's part icons and dice tray are the full run's pictures, replacing the trial's.

## Found and fixed while checking

- The plate's words were 7–9 px at first: the plate is larger and every size has a 12 px floor.
- On a phone the plate's picture took the whole first screen: there its words head the page.
- The board's lamp-lit end repeated under every book: the board is cut from its evenly lit middle.
- "Look inside the book" returned focus while the dialog was still modal, so it was lost
  (`hub-library` journey): the dialog closes natively and the shelf focuses the label after it.
- A long pitch pushed Start and Close below the fold of the phone's dialog: they stay at its foot.
- The account's page stood after the whole library (14,000 px down on a phone): the shelf's head
  links to it.
- The full run found a Stage 1090 defect: the table screen's story, battlefield and rolls kept their
  full-window heights inside the binding's margin and the screen scrolled. Fixed on Stage 1090's
  branch and carried here.

## Not in this stage

The ready adventures have no cover picture on their books; the shelf's books are not ordered or
grouped by the account (ADR 0075 §10.7). The players' and the DM's own books use their campaign's
new set from this stage on — their paper, binding and icons were looked at only through the
journeys' axe checks, not screen by screen.

## Verification

| Check                                                                            | Result                                                                           |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build` | pass                                                                             |
| `pnpm run test` (unit)                                                           | 5,120 of 5,120                                                                   |
| `pnpm run context-budget`                                                        | pass                                                                             |
| The way in's, the hub's and the library's journeys, Chromium (38, 23 files)      | 37 passed, 1 then fixed                                                          |
| Every Chromium journey but `party-known`                                         | 384 of 385; `story-cast` failed on a Stage 1090 defect, fixed there, then passed |
| Sign-in, invitation, failed link, the shelf, "Look inside", privacy              | looked at and audited, 1440, 1024, 768, 390                                      |

Not run locally: the iPad project and WebKit — CI runs them.

## Next

Stage 1110: the manuscript — the desk and the pages.
