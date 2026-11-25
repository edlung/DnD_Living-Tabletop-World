# The table's screen: the fight on the book's paper — report (2026-11-25)

Work order `work-orders/BOOK_TV_FIGHT_PAPER_2026-11-25.md`; ADR 0075 §30. Branch
`claude/book-tv-fight-paper`, stacked on `claude/book-choices-faces` (pull request 111). Status:
**implemented; nothing is merged or deployed.**

## What changed on the screen

| Before                                                                       | Now                                                                |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| The fight on the TV: the map on a dark ground, the order of turns dark glass | The book's paper with its fold; the order of turns a slip of paper |
| «Стол ждёт бросок» over the fight: a dark plate with a gold edge             | A slip of the paper, its heading in the rubric's red               |

The quiet spreads, the title and the story's words were on paper already (§19).

## New phrases of the interface

None.

## Verification

- **Static**: format, lint, typecheck, the context budget; unit tests.
- **Journeys** (Chromium, the iPad project, WebKit): the table's screen, its display, its moments,
  pairing, the room, online, the comforts' screens, the story's cast, the release journey —
  14 of 14.
- **Looked at, with the layout audit**: the TV at 1920 × 1080 with a fight and with the rolls'
  spread (the audit's one warning, a page wider than 1600 px, is a television's by design).
- **Not verified**: a real television across a room.
