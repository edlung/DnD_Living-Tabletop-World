# Stage 1030 completion — the DM's book is the DM's screen

Work order `work-orders/STAGE_1030.md`; program `docs/BOOK_INTERFACE_PLAN.md`; ADR 0075 §3;
2026-11-23. Status: **implemented; deployment waits for the owner's rehearsal on his tablet** (the
plan's main risk: this stage changes how the DM reaches everything, with no switch back). Branch
`claude/stage-1030-dm-book-shell`, stacked on Stage 1020's.

## What changed

- **No dock for the DM.** `apps/web/src/shell/book-parts.tsx`: seven bookmarks at the book's
  fore-edge in the campaign's own icons — Книга, Сцена, Герои, Мир, Журнал, За столом, Правила —
  and the open part's pages as tabs along the top. Every section the dock held is a page of one
  part (ADR 0075 §3.1); a part opens at the page last read in it; a closed page returns to the
  Scene with focus on its bookmark. The dock (`shell/dock.tsx`) keeps a player's items only; the
  book-presence store went with the DM's Book button.
- **Every DM section on paper** (`styles/book-shell.css`): the campaign's binding around the stage
  and the pages, the campaign's paper under each section, the paper scope of the tokens on it; the
  dark grounds of fields and cards turn into lighter paper there (`styles/tokens.css`). The scene
  and its picture sit inside the binding; the selection's drawer lies on the page beside the
  bookmarks on a tablet.
- **The DM's book** keeps only its own two views (pages, contents); the sections are parts now.
- **Journeys**: `tests/e2e/support/shell.ts` finds a DM section's tab and opens its part first;
  the DM's dock journeys became `tests/e2e/dm-book-parts.spec.ts` (every part and page at six
  widths, in English and Russian; parts remember their page; focus); journeys that waited for the
  DM's dock wait for the book's parts; four section-layout journeys measure the page inside the
  binding instead of the whole stage.

## Found and fixed while checking

- A tab just pressed stayed under the base button's hover (`button:hover:enabled` outranks a
  class): its open state showed glass under dark ink, which axe caught at every width. The tab's
  and bookmark's states now outrank hover, and they do not fade (a state shows at once).
- The bookmarks' gradient had no colour under it, so with pictures set aside their words had no
  ground; they have one now.
- The selection's drawer covered all seven bookmarks at 768 and 1024 px; it lies beside them now.
- The battlefield and its panels ran under the bookmarks; they sit inside the book like the scene.
- The sign-out question had no colour under its glass; over a paper page its words lost contrast.
- The helper opened a page twice when its part opened it already, closing it again.

## Session's decisions in this stage

- The parts' names: Книга for the Story part (Russian «История» is already the History page's
  name), Герои, Мир, За столом as in the demo.
- The running head stays the top bar for now; the dice at the foot of every page, slips and the
  Scene as a spread are Stages 1050 and 1080 (ADR 0075 §3.5).

## Verification

| Check                                                                                                   | Result                                                                                         |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build`                        | pass                                                                                           |
| `pnpm run test` (unit)                                                                                  | 5,111 of 5,111                                                                                 |
| Every journey, Chromium, WebKit and the iPad project (`party-known` aside, which floods a local server) | 402 passed, 6 failed, then the 6 fixed (below) and re-run with the battle's journeys: 44 of 44 |
| Every part of the DM's book at 1440, 1024 and 390 px, screenshots looked at                             | readable on paper; fields and cards light; the scene inside the binding                        |

The six that failed in the full run, and why: a journey waited for the DM's Players tab to be
visible (it is in the document, its part closed); the keyboard journey focused a tab whose part
was closed; the fit check measured a dock the DM no longer has; the sign-out question had no
ground of its own and a paper page showed through its glass (it has one now); the battlefield's
own buttons lay under the bookmarks (the battle sits inside the book now); one check of the DM's
dock.

## Open

- **Rehearsal before deployment** on the owner's tablet: this is the stage after which the DM has
  no dock.
- The sets of the remaining campaigns are still being drawn for Stage 1020; until a campaign's set
  exists, its book wears its theme's material and the product's glyphs.

## Next

Stage 1040: the hero's book.
