# The fight as the concept draws it

The owner, on pull requests 108–112: «экран боя далек от концепта. задача — сделать как в
концепте» (`reviews/OWNER_BOOK_FIGHT_CONCEPT_2026-11-25.json`). The concept:
`~/Documents/living-tabletop-world-art/book-polish-2026-11-24/out/fight-foldout.png` (its prompt
beside it). ADR 0075 §31. Stacked on `claude/book-tv-fight-paper` (pull request 112).

## Scope

- From a tablet up (701 × 501 px), the battlefield with no page open over it: one sheet of map
  paper over the whole book, a thin rim of the cover, no spine, two soft folds
  (`styles/fight-concept.css`).
- The map painted onto the sheet; the order of turns a row of faces along the sheet's upper edge
  with a flag under whose turn it is (`combat/hud/initiative-strip.tsx`); «Раунд» a paper label.
- The slip of the turn beside the figure whose turn it is (`combat/sheet-anchors.ts`,
  `styles/fight-concept-slips.css`); ending the fight a tag at the lower left
  (`combat/dm-turn.tsx`); the d20 in a felt tray at the lower right.
- The journeys' helpers follow the slip to the Encounter page (`tests/e2e/support/shell.ts`).

## Out of scope

A phone's fight; the table's screen; what the server sends and decides; the tilt on wide screens
(the concept is flat; the tilt from 1200 px stays as it was); merging and deployment.

## Acceptance

- At 766 × 799, 1024 × 768, 1280 × 720, 1440 × 900 and 834 × 1194 the fight is one sheet with the
  order's faces along its top, the slip beside the acting figure and inside the sheet, the corner
  tags and the d20's tray; nothing covers a control or a square another control needs.
- The fight's journeys pass in Chromium; the layout audit finds no error on the fight.
- Every new phrase of the interface is listed for the owner: «Ходит».
