# Stage 1120 completion — the manuscript: writing on the page

Work order `work-orders/STAGE_1120.md`; program `docs/BOOK_INTERFACE_PLAN.md`; ADR 0075 §12;
2026-11-23. Status: **implemented; not merged, not deployed**. Branch `claude/stage-1120-writing`,
stacked on Stage 1110's.

## What changed

- **The structured editor and the protections are the manuscript's page**, no longer a card on it
  (`styles/workshop-writing.css`).
- **Words in the column**: names, texts and descriptions are written in the page's column; beside
  each, in the margin, how many more characters fit ("Characters left: 110", a new phrase, Russian
  «Осталось знаков: 110») (`workshop/editing/field-controls.tsx`).
- **What is chosen in the margin**: a choice from a list or a reference, a number, a yes or no and
  "Add …" stand beyond a ruled margin line, each label in the column with a dotted leader to its
  value; nested parts keep their right edge on the page's so the margin lines up; below 768 px the
  page is one column.
- **A protection's note in the margin where it begins** (a key and "Locked content. Unlock it
  explicitly before changing it.", the collections' existing words); the fields kept stay locked
  as before.

## Found and fixed while checking

- Stage 1110's bookmarks stood two by two on a 390 px phone (the layout audit's `tabs-wrapped`):
  fixed on Stage 1110's branch — one row down to 360 px, narrower a row that scrolls with a fading
  edge — and carried here.
- Single-line fields ran 912 px wide and the protections' search 1,176 px (`wide-field`): capped
  at 40rem.
- With words in the column and choices in the margin, the words' rows ended short of their
  siblings (`row-content-misaligned`): each now has its characters left in the margin.

## Not in this stage

The inspector's quick corrections ("Edit fields") and the targeted AI edit keep their layout until
the co-author comes to the book in Stage 1130 (ADR 0075 §12.5).

## Verification

| Check                                                                            | Result                                      |
| -------------------------------------------------------------------------------- | ------------------------------------------- |
| `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build` | pass                                        |
| `pnpm run test` (unit)                                                           | 5,120 of 5,120                              |
| `pnpm run context-budget`                                                        | pass                                        |
| Every workshop journey, Chromium (55 in 21 files)                                | 55 of 55                                    |
| The editor's Opening and Cast sections, a protection, the protections            | looked at and audited, 1440, 1024, 768, 390 |

Not run locally: the other journeys, the iPad project and WebKit — CI runs them.

## Next

Stage 1130: the manuscript — the co-author, the plates, the binding.
