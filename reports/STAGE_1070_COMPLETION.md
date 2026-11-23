# Stage 1070 completion — Heroes, World, Journal as spreads

Work order `work-orders/STAGE_1070.md`; program `docs/BOOK_INTERFACE_PLAN.md`; ADR 0075 §7;
2026-11-23. Status: **part of the stage implemented; not merged, not deployed**. Branch
`claude/stage-1070-parts-as-spreads`, stacked on Stage 1060's.

## What changed

- **The hero's sheet is a spread** (`styles/book-spreads.css`): the card — portrait, name, class,
  hit points, the four figures — is the left page, the tabs the right, the fold between, all on
  the book's paper.
- **The two-part sections are spreads**: Places (the map and the choice of place), Add to the world
  (the words for the AI and the editors by hand) and the Encounter (the fights ready and a fight
  with who is here) as two equal pages with the fold in the gutter. Sections of one thing or of
  many cards stay one wide page.
- **A phone's Scene is one page of the book** (`world/scene.tsx`): its picture at the head, the
  place's words, who and what is here and the ways beyond on paper under it, inside the binding's
  margins; the place's name and who is at the table lie on the picture as paper labels; the quiet
  row keeps a ground of its own.

## Found and fixed while checking

- The campaign theme drew the hero's card on the binding's dark material while, on paper since
  Stage 1040, its words were the page's dark ink: "Hit points", the class line and the figures
  could hardly be read. The card is on paper now.
- On a phone the book's page inset moved the scene column (an offset on a column item); the
  stage's margin carries it now.
- The Stage 1050 rule that lays a result on the spread's plate reached the result in the hero's
  sheet too and covered its last lines (CI on Stage 1050; fixed there and carried here).

## Not in this stage

The plan's section 1070 also names the party's own page beside a hero's spread, pictures on their
plates, the time and weather in a running head, handouts and asks as slips, the Chronicle inside
the book and the world map as a fold-out. None of these is built yet; ADR 0075 §7.4 defers each to
the rebuild of its part. Every section keeps its forms and controls meanwhile.

## Verification

| Check                                                                            | Result                   |
| -------------------------------------------------------------------------------- | ------------------------ |
| `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build` | pass                     |
| `pnpm run test` (unit)                                                           | 5,119 of 5,119           |
| The parts' journeys, Chromium (120, 42 files)                                    | 118 passed, 2 then fixed |
| Those two and the phone, sheet and quiet-row journeys again (34)                 | 34 passed                |
| Every section at 1440 and 1024 px, the hero's sheet and the phone at 390 px      | looked at                |

Not run locally: every other journey, the iPad project and WebKit — CI runs them.

## Next

Stage 1080: Table and Rules, and the dice at the foot of every page.
