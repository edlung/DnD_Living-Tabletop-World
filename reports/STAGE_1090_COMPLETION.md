# Stage 1090 completion — the open book on the table

Work order `work-orders/STAGE_1090.md`; program `docs/BOOK_INTERFACE_PLAN.md`; ADR 0075 §9;
2026-11-23. Status: **implemented in part; not merged, not deployed**. Branch
`claude/stage-1090-table-book`, stacked on Stage 1080's.

## What changed

- **The table's screen is the campaign's book lying open** (`styles/display-book.css`): the
  campaign's binding around the page, pictures and the battlefield as plates in it.
- **What is read lies on the book's paper** (`display/display-app.tsx` marks those casts): the
  table's rolls, the agreement, the Chronicle's chapter, the stars and the bookplate to join.
- **A title card is a title page**: the campaign's picture as the plate on the left page, the title
  in the campaign's rubric on the right, the fold between.
- **Nothing cast is the closed cover**, its emblem in the middle, as dim as the dark screen asked.

## Found and fixed while checking

- The screen's own buttons (sound on, the corner's) were glass over the dark art; over paper their
  words could not be read (axe in `display-moments`, `table-display`): they keep a dark ground.
- A title's picture as a replaced element ignored the right inset and filled the page: it is
  sized to the left page now; the theme's dark material under the title is off on paper.
- The fold ran through centred words (joining, "No rolls yet."): only the title page has a fold.

## Not in this stage

The players' "Table screen" online keeps the casts as before inside its page of the book; the TV
shell's remote and sound were not driven here (ADR 0075 §9.4).

## Verification

| Check                                                                            | Result                  |
| -------------------------------------------------------------------------------- | ----------------------- |
| `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build` | pass                    |
| `pnpm run test` (unit)                                                           | 5,119 of 5,119          |
| The table screen's and the evening's journeys, Chromium (32, 21 files)           | 30 passed, 2 then fixed |
| The scene, a title, the rolls, the agreement, joining and the dark screen        | looked at, 1920 and 960 |

Not run locally: every other journey, the iPad project and WebKit — CI runs them.

## Next

Stage 1100: the shelf.
