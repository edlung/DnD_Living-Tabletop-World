# Stage 1110 completion — the manuscript: the desk and the pages

Work order `work-orders/STAGE_1110.md`; program `docs/BOOK_INTERFACE_PLAN.md`; ADR 0075 §11;
2026-11-23. Status: **implemented; not merged, not deployed**. Branch `claude/stage-1110-desk`,
stacked on Stage 1100's.

## What changed

- **The workshop lies on the writer's desk**: the product's set gains the desk (a Codex CLI picture
  from the demo's run, walnut with a green blotter, ink, candle and seal) behind the whole workshop,
  its way in included (`styles/workshop.css`, `workshop/app.tsx`).
- **The home is the desk**: a new draft is a blank sheet of the book's paper; each draft a
  manuscript, a stack of loose pages with its title and language; each confirmed campaign a bound
  book in its own binding — the shelf's book — with its label: the confirmed revision, "Enter
  campaign" and "Open source draft" (`workshop/drafts.tsx`, `campaigns/list.tsx`,
  `styles/workshop-desk.css`).
- **A draft's scenario is the manuscript**: the four sections are bookmarks on the page's top edge;
  the Scenario is on the book's paper; its contents ("Explore the scenario") on the left page and
  the object read on the right with the fold between; below 1100 px the contents stand above the
  page (`workshop/editor.tsx`).
- **A new manuscript from the library**: each campaign's card in its own paper under its cover.
- **Revisions compared are two proofs side by side**, before and after, each on its sheet.

## Found and fixed while checking

- On a phone the four bookmarks wrapped to a second row; at 320 px one row ran off the screen
  (`workshop-*-accessibility`, `*-package-import`): one row down to 360 px; narrower, the row
  scrolls with its far edge fading (first fixed as two by two below 401 px, which put a 390 px
  phone on two rows — the layout audit's `tabs-wrapped`, found in Stage 1120).
- The library's cards took their campaign's dark furniture and light gold onto the page, so their
  meta failed contrast (`workshop-library`): they wear their campaign's paper and the page's ink.
- A book's margins were percentages of its column, not of the book, so in the workshop's wider
  column the cover's title label shrank to a few letters a line: the margins and the label are in
  the book's own measure now (the shelf's books, Stage 1100, gain the same fix).
- The proofs touched each other (the layout audit): they stand 12 px apart.
- CI's iPad `hero-story` lost a backstory's unsaved words after a look at the pack: while the world
  refreshed, its directory was empty for a moment, the open hero was not found and the Story tab
  went with its words. The open sheets keep the last directory through a refresh, as authoring
  did (`world/world.tsx`). Not of this stage's making; first seen on its pull request.

## Not in this stage

Editing on the page (structured fields, the margin, locks) is Stage 1120; Generation, World
preview, pictures and Activation keep their glass until Stage 1130 (ADR 0075 §11.5). The workshop's
header words follow the browser's language, not the draft's, as before.

## Verification

| Check                                                                            | Result                                           |
| -------------------------------------------------------------------------------- | ------------------------------------------------ |
| `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build` | pass                                             |
| `pnpm run test` (unit)                                                           | 5,120 of 5,120                                   |
| `pnpm run context-budget`                                                        | pass                                             |
| Every workshop journey and the shelf's, Chromium (61 in 23 files)                | 55 passed, 6 then fixed                          |
| The workshop's and the shelf's journeys after the fixes (37 in 17 files)         | 37 of 37                                         |
| The desk, a draft, a comparison, the desk with a bound book, the library pick    | looked at and audited, 1440, 1024, 768, 390, 320 |

Not run locally: the other journeys, the iPad project and WebKit — CI runs them.

## Next

Stage 1120: the manuscript — writing on the page.
