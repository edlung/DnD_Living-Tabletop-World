# The book is the whole screen — report (2026-11-25)

Work order `work-orders/BOOK_WHOLE_SCREEN_2026-11-25.md`; ADR 0075 §24; the owner's words
`reviews/OWNER_BOOK_WHOLE_SCREEN_2026-11-25.json`. Branch `claude/book-full-screen`, stacked on
`claude/second-pass-review` (pull request 105). Status: **implemented; nothing is merged or
deployed.**

## Why

The owner looked at the second pass running and said it plainly: nothing had changed to the eye;
a header stood over the book; pages were radio buttons, dropdowns and input forms; Codex CLI had
not been used for the frame. He was right. Pull requests 97 to 105 moved what each page holds and
never built the picture he had chosen (direction А, a real book). This work builds it.

## What changed on the screen

| Before                                                                  | Now                                                                                                                         |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| The application's top bar over the book, two rows of it at 766 px       | No bar. The cover's cloth to the screen's edges, a corner fitting on each corner, the campaign's name a page's running head |
| The view, how to play, refresh, the shelf, the account, leaving in it   | Behind the clasp on the cover's corner — the book's emblem — on a slip of the book's paper, at every width                  |
| A dark strip of dice buttons under the page                             | The page's own foot, on its paper; each die a picture in the book's own material                                            |
| Rounded cards, input boxes, browser radio buttons and checkboxes        | Passages under a rubric with a rule; ledger fields; inked rings and squares filled in the rubric's red; stamped labels      |
| A dark bar "the evening has not begun", a dark bar "you act for a hero" | Slips of the book's paper                                                                                                   |
| Between 701 and 767 px, a phone's dark column inside a tablet's shell   | The book from 701 px: the tablet's pages and the fight's fold-out on paper                                                  |
| Under 900 px, a map of 340 × 280 px in a fight                          | The map across the page (510 × 405 at 766 × 799)                                                                            |
| A phone's dark head                                                     | The cover's upper edge: the hero's plate a paper label, the same clasp and slip, the dice drawn                             |

## Pictures by Codex CLI

One corner fitting of the cover and one set of dice for each of the 56 books (118 pictures: a
fitting and a sheet of six dice a book; «Маяк Между Ветрами» has its seven dice one by one). Each
book's own finished cover, tray and Book icon were the style references, so a set's metal and its
dice are of that book: verdigris bronze and dark green for the noir, bone for the dark fantasy,
enamel and brass for the lantern tale. No picture failed; every sheet was cut into its six dice
by the build. Originals: `~/Documents/living-tabletop-world-art/book-frame-2026-11-25/` (prompts,
references, `out/`), copied into `book-sets-2026-11-23/final/<theme>/` as `cover-corner.png`,
`dice.png` (or `die-d*.png`).

## Found on the way

- **A two-line caption of whose turn it is lay over the board's own tools** in a wide fight and
  took their presses once the page grew by the bar's height: the tools stand on the map's corner
  under it.
- **Escape in a question opened from the slip closed the slip too** (the question before signing
  out is written outside it), and a press inside the guide counted as a press outside the slip:
  a dialog a row opened keeps the slip and gets its row's focus back.
- **The clasp stood over a hero's fight** (its page takes the whole width there): in a hero's
  fight the clasp stands in the bookmarks' row at the cover's lower corner and its slip opens
  upward.

## New phrases of the interface

None: the clasp is named «Ещё» as on a phone, and every control behind it keeps its name.

## Files

New: `apps/web/src/styles/book-whole.css`, `book-controls.css`, `book-phone.css`; 448 pictures
under `apps/web/public/book-materials/*/` (`cover-frame.webp`, `die-d4` … `die-d100.webp`).
Changed: `session/app.tsx` (the campaign's name for the running head), `shell/top-bar.tsx` (a
dialog's Escape and presses), `dice/book-foot.tsx`, `dice/roll-builder.tsx`,
`book-kit/materials.ts` (`diePicture`, `dieStyle`), `combat/board/board-view.ts` and eight
stylesheets (the book from 701 px), `styles/fold-out.css` (the map across a narrower page),
`scripts/book-materials/build.ts` (the dice, the cover's frame, a sheet's cut), the generated
`manifest.json` and `book-materials.css`; forty-odd journeys (the slip is opened before one of
its controls is reached: `openTopMenu`, `closeTopMenu`).

## Verification

| Check                                                          | Result                                                |
| -------------------------------------------------------------- | ----------------------------------------------------- |
| `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check` | pass                                                  |
| `pnpm run context-budget`                                      | pass (3,011 files)                                    |
| `pnpm run test` (unit)                                         | 5,137 of 5,137                                        |
| The whole suite: Chromium, the iPad project, WebKit's release  | 415 of 426 in the run; the eleven then 27 of 27 alone |
| The journeys touched by the last edits (ten specs)             | 42 of 42                                              |

The whole run took 56 minutes where it takes 22: for about seventeen of them the machine stood
still (two journeys on two workers both ended after 1,050 seconds), and eight journeys around
that pause ran out of time. Three failures were real — a journey went on from the guide with the
slip still open (twice, in two projects), and one read a control of the slip by its role while
the slip was shut — and are fixed in the journeys. All eleven, with every other journey of their
six files, then passed alone in both projects, 27 of 27. The whole suite was not run a second
time after that; CI runs it.

Before that run: the first whole run on this shell failed 71 journeys — 49 for the main action's
red, which was a picture over no ground (cream words on paper once a scan sets pictures aside),
the rest mostly for controls now behind the clasp — and each was worked through.

The layout audit (`ui-layout-audit`) of the Scene, the slip, the fight at two widths and a second
book's Scene is clean. It names two things that are meant: the page's foot touches the page (it
is the page's own foot), and a passage with little in it does not reach the column's edge. At
766 px the row of who is at the table still runs past the page's edge and is cut, as on a phone.
It also found the rest's heading id used twice (the tool stands on two pages since Stage 1170):
the tool's ids are its own now.

Looked at on the audit's own servers: every page of the DM's book (twenty) at 1024 × 768; the
Scene at 1440 × 900 and 766 × 799; a fight at 1024 × 768 and 766 × 799; a player's phone at
390 × 844 with the slip open and the hero's sheet; every book's fitting and dice on contact
sheets.

Not run: `party-known`, `voice.spec.ts`, the native shells, a real tablet, phone or television.

## Left

- The story's page is not the concept's page yet: no ornament at its foot, no page number; the
  things of the place are plates with names, not the concept's round portraits.
- The table's screen, the shelf, the way in, the workshop and the Chronicle's own dialog are as
  they were.
- A hero's sheet on a phone is a dialog over the book; its tiles are still rounded boxes.
- The clasp in a hero's fight stands at the lower corner, elsewhere at the upper one.
- Two words for one thing («Начать вечер» → «Начать сессию») wait for the owner's word.
