# The fight as the concept draws it — report (2026-11-25)

Work order `work-orders/BOOK_FIGHT_CONCEPT_2026-11-25.md`; ADR 0075 §31. Branch
`claude/book-fight-concept`, stacked on `claude/book-tv-fight-paper` (pull request 112). Status:
**implemented; nothing is merged or deployed.**

## What changed on the screen (from a tablet up, the battlefield with no page open)

| Before (pull request 108)                                     | Now, as the concept                                                                      |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| The book's spread: the spine down the middle, the page's tabs | One sheet of map paper over the whole book, a thin rim of the cover, two soft folds      |
| The map a framed picture                                      | The map painted onto the sheet, its edges bleeding into the paper                        |
| The order of turns a column or a row of cards with names      | A row of round faces on a gilt line along the top; the acting one larger, a flag «Ходит» |
| «Раунд 1» inside the order's card                             | A paper label at the upper right; a player's own line (whose turn, hit points) under it  |
| The slip of the turn across the foot of the page              | Beside the acting figure, on the first spot that covers no figure, plate or target       |
| «Закончить бой» inside the slip                               | A paper tag at the lower left                                                            |
| The book's dice in its foot                                   | The d20 in a felt tray at the lower right                                                |
| Wide bookmarks with words                                     | Small tags on the rim, their words said to a reader of the screen                        |
| The fold's handle and the board's tools as pills              | Tags of the same paper                                                                   |

What the table asks («Сессия ещё не началась», a check) and the result of an action lie on the
sheet's foot between the corners instead of over the map. While the DM paints the ground or carries
a figure, the slips step out of sight.

Kept: the card of what is chosen over the map's far edge, the margin of cards where the map
leaves room, a phone's fight, the table's screen, the tilt from 1200 px (the concept is flat;
the Flat control still flattens it).

## New phrases of the interface

- «Ходит» — the flag under the face whose turn it is (the concept's own word). On a player's
  own turn the flag says the existing «Ваш ход».

## Verification

- **Static**: format, lint, typecheck, the context budget (0 over target); unit tests, 5139 of 5139.
- **Journeys** (Chromium): the fight and book set, 66 of 66 (37 files: the fight from the map,
  the turn, the narrow screen, plates, pointer, light, terrain, paint, encounters, party, summons,
  opportunity, reactions, the book's parts); the other projects run in CI.
- **Looked at, with the layout audit**: 766 × 799, 1024 × 768, 1280 × 720, 1440 × 900,
  834 × 1194; the DM on a hero's turn, on a creature's turn, a player on their turn.
- **Not verified**: a real iPad in the hand; the owner's eye.

## Open points

- The faces' names are said, not shown (as the concept): the audit's `twin-labels` warning for two
  creatures alike is answered by their numbers.
- The bookmarks on the fight's sheet are icons alone; their words are their accessible names and
  tooltips.
