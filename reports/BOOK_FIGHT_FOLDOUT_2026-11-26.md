# The illustrated combat fold-out

The November 26 follow-up to [the combat work order](../work-orders/BOOK_FIGHT_CONCEPT_2026-11-25.md)
uses the owner's `fight-foldout.png` as the visual reference. The example is the Lighthouse
harbour encounter opened from the Scene spread in a new Russian-language game.

## At the table

- On a tablet or desktop the map opens level. Miniatures stand on their grid squares. The
  portraits along the top, active turn and round come from the encounter in play.
- A hero can choose «Атака», «Заклинание», «Идти» or «Другое» beside their figure. Picking one
  frees the board for target selection. The existing rules decide which actions resolve.
- The DM can take a hero's turn or run a creature. Ending the encounter asks for confirmation.
  The terrain palette opens beside the map so the DM can paint every square.
- Each setting supplies its battlefield, pieces and portraits. The Lighthouse also uses the
  blossoms from the reference. Calibrated and fogged maps retain their projected bounds.

## Views from the game

A DM started a fresh play session and opened the harbour fight with three heroes and two
automatons. The hero view follows the DM taking control of Tess. The captures use the same round.

The tour saves separate JPEGs for the DM, the hero on a landscape tablet, the wide and portrait
views, and the two other window sizes. The owner received the original captures for visual review.

## Reproduce and verify

```sh
pnpm exec playwright test -c playwright.evidence.config.ts --project=chromium fight-foldout
```

The [capture run](https://github.com/edlung/DnD_Living-Tabletop-World/actions/runs/45783129060)
checks the four choices, coverage at every edge of the viewport and the alignment of the
active miniature to its base at 766 × 799, 1024 × 768, 1280 × 720, 1440 × 900 and 834 × 1194.
It saves the full screenshots under `test-results/foldout-review/`.

The regular journeys cover keyboard focus, movement, attacks, the DM's controls, calibrated
maps, the brush, fog, Quickened Fire Bolt and poison-dart disarm. The [PR checks](https://github.com/edlung/DnD_Living-Tabletop-World/pull/113/checks)
record the results on the current revision. Owner visual acceptance and a trial on a physical
iPad remain open.
