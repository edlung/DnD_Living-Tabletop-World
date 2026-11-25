# Every slip and window on the book's paper — report (2026-11-25)

Work order `work-orders/BOOK_ON_PAPER_2026-11-25.md`; ADR 0075 §27; the owner's words
`reviews/OWNER_BOOK_LOOSE_ENDS_2026-11-25.json`. Branch `claude/book-on-paper`, stacked on
`claude/book-fight-whole-screen` (pull request 108). Status: **implemented; nothing is merged or
deployed.**

## Why

«Закончи сначала все недоделки интерфейса.» A survey of every page, window and overlay of the
DM's and a hero's book at the owner's width — each page photographed whole, each window opened,
and a script naming every box that still paints a dark ground — showed where the old application
was left: the windows opened from the cover's clasp, the Chronicle's head, a hero's builder, what
is laid over a page while the game runs, a phone's fight, and long lists set as rows of boxes.

## What changed on the screen

| Before                                                                                 | Now                                                                                                         |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| The result of an action: a dark glass card with a teal edge                            | A slip of the book's paper with the page's ink, closed by the drawn cross                                   |
| What the table asks (a check, a rest, a pause, a break): dark pills                    | Slips of the same paper, cut square, with the page's stamped buttons                                        |
| «Как играть», «Выйти?», «Сохраните место за логином»: dark panes with teal buttons     | Slips of paper over the dimmed book: a rule under the title, rubrics, ledger fields, the main action in red |
| A hero's builder: a grey pane (the paper's inks over a dark grain)                     | A slip of paper; the step it stands on in the rubric's red; each step under its rubric                      |
| The Chronicle's head: a dark bar with glass pills and a boxed cross                    | The book's head: three index tabs of paper on its page, a stamped label, the drawn cross, the cover's cloth |
| A phone's fight: dark glass panels over the place's picture                            | A page of the book's paper, as the phone's other pages are                                                  |
| The Journal's known people and places, the places to go, the glossary: rows of boxes   | An index: a line under a hairline, its kind in small capitals; the open entry in the rubric's red           |
| The Dice page's picker: stamped boxes «d4 … d100» (the page's foot had the drawn dice) | The book's own drawn dice, each with its name                                                               |
| Cards and fields with rounded corners                                                  | Cut square on paper: a slip, a plate and a field are a printed page's                                       |

## Found on the way

- **A rule lost to a stronger one**: the Dice page's drawn dice had been styled since the
  whole-screen book, and the page's rule for a stamped button outweighed it — the picker never
  showed them. The survey's pictures, not a test, showed it.
- **The grey builder** was the paper's inks on a dialog that kept its dark grain: a window inside
  a page took the page's tokens and not its ground. A window now carries its own.
- **The layout audit learned two things** (the skill's `audit.mjs` and `SKILL.md`, outside the
  repository): a heading inside an open modal dialog cannot lie under a page's fixed panel; text
  inside a box clipped for a reader of the screen is hidden on purpose.

## New phrases of the interface

None: every window and slip keeps its words.

## Files

New: `apps/web/src/styles/book-slips.css` (slips, windows, the Chronicle's head, a phone's
fight), `book-index.css` (an index, the Dice page's dice, square corners).
Changed: `exploration/action-notice.tsx` and `alerts/table-asks.tsx` (the paper's surface);
`guide/guide.tsx`, `guide/about.tsx`, `hint/turn-hint-button.tsx`, `ritual/agreement.tsx`,
`session/sign-out-dialog.tsx`, `session/account-menu.tsx`, `session/account-data.tsx`,
`builder/builder-dialog.tsx`, `builder/level-dialog.tsx`, `chronicle/generate-chapter.tsx` (each
marked as paper); `combat/fold-out.ts` (paper wherever the fight is in a book).

## Verification

- **Static**: format, lint, typecheck, the context budget.
- **Unit**: 5,139 of 5,139.
- **Journeys** (Chromium and the iPad project): the windows and slips — about, accounts, the
  agreement, actions, a hero's builder, the Chronicle (its book, pinned chapters, the writer),
  the narrow fight, reactions, the guide, the result's layer, own dice, the pause, a phone's head
  and layout, rests, the result's layout, signing in and out, the turn hint, raising a level,
  the screens of each section, comforts, accessibility — 106 of 106; then the lists, the dice
  and the corners — the rules' reference, the toolbox, details and scenes, dice, the DM's book,
  what the party knows, the page's foot, pages by tasks, the working spread — 73 of 73. The whole
  suite was not run locally for this stage; the pull request's checks run it.
- **Looked at, with the layout audit on each**: every window opened from the cover's clasp as the
  DM and as a player, the Chronicle, a hero's sheet and its tabs, the builder's steps, a result
  on the fight, what the table asks, a phone's fight, every page of the DM's book whole at
  766 px. The session's `dark-tour` over every page of both books at 766 px names nothing but the
  Chronicle's desk under its cloth.
- **Not verified**: a real phone and tablet; a screen reader; the builder's last steps and a new
  level's window beyond their first look.

## Left for the next stages

The list a select opens, a date's field and scroll bars are still the browser's; the shelf, the
way in, the table's screen and the workshop have not been looked at in this pass.
