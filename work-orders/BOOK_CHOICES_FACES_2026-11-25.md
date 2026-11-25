# The remaining choices drawn

The fourth of the interface's loose ends the owner asked to have finished
(`reviews/OWNER_BOOK_LOOSE_ENDS_2026-11-25.json`), finishing his earlier ask «стандартные формы
можно заменить сгенерированными значками где только можно?» (§25). ADR 0075 §29. Stacked on
`claude/book-forms-drawn` (pull request 110).

## Scope

- **Faces** (`book-kit/hero-tiles.tsx`: several leading tiles, a face's own words): an
  invitation's character and another character for a player (`dm/players-sheet.tsx`,
  `dm/players-lists.tsx`), who catches a contagion (`dm/toolbox-forms.tsx`), whom a chat line is
  for (`chat/chat-sheet.tsx`), who sees a roll (`dice/roll-builder.tsx`).
- **Vignettes**, thirty-four more by Codex CLI in the product's set: the table's sound
  (`dm/sound-choice.tsx`), what to make and the kind of place (`dm/editors/make-by-hand.tsx`,
  `thing-forms.tsx`), how a chat line is said, a creature's side (`combat/bestiary-form.tsx`), the
  road's hazard (`rest/dm-hazard-controls.tsx`), three campaign options (`dm/campaign-options.tsx`).
- **Words** (`book-kit/pick.tsx`: `PickTiles` `words`, an option's `sample`): an invitation's
  and the table link's hours (`dm/table-link.tsx`), a trap's tier, a stress's save, the text's
  size (`comforts/text-size.tsx`).
- **The journeys** choose with `tile()`.

## Out of scope

Lists of the world's names and of many numbers; who runs a creature; how dice move; every
command, route and contract; merging and deployment.

## Acceptance

- Each converted choice is made by pressing a face, a vignette or a word; each keeps its group's
  name and its options' words for a reader of the screen and the keyboard.
- Static checks, unit tests (a picture for every drawn choice) and the journeys pass; the layout
  audit of the changed pages is clean.
- Every new phrase of the interface is listed for the owner (there is none).
