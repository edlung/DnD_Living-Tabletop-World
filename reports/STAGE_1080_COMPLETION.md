# Stage 1080 completion — Table, Rules and the dice at the foot

Work order `work-orders/STAGE_1080.md`; program `docs/BOOK_INTERFACE_PLAN.md`; ADR 0075 §8;
2026-11-23. Status: **part of the stage implemented; not merged, not deployed**. Branch
`claude/stage-1080-table-rules-foot`, stacked on Stage 1070's.

## What changed

- **The dice at the foot of every page** in both books (`dice/book-foot.tsx`,
  `styles/book-foot.css`): a tray across the binding's lower edge under the page, in the
  campaign's own tray material — the seven dice, the last roll the table saw and "More dice" to
  the Dice page. One press rolls one die for the table through the same free roll the Dice page
  sends; the dice fly for everyone who may see them.
- On a phone the tray lies above the bookmarks along the bottom with d20, d6 and d8; the quiet row
  and a result keep clear of it.
- In a fight the turn tray is the page's foot and the dice tray steps aside.
- Every page's lower edge, the Scene's spread and the phone's page end above the tray
  (`--foot-h`, `--page-bottom` in `styles/book-shell.css`).
- `tests/e2e/book-foot.spec.ts` on its own campaign (`ui-dice-foot`).

## Found and fixed while checking

- On a phone the quiet row («Что я могу?», «Попросить паузу») lay under the tray: what kept clear
  of the tab bar keeps clear of the dice too.
- `section-screens.spec.ts` measured a section's foot against the binding's edge; the page ends
  above the dice now, and the journey measures that.

## Not in this stage

The plan's section 1080 also names the meeting as a page of the Table (start with "Previously…",
pause, end, the next game, the agreement, the break), the table's sound, music and voice as its
pages, and the rules, toolbox and guide as an appendix opened from a rule's word. These keep the
sections Stage 1030 put in the book; ADR 0075 §8.4 defers them with the parts of §7.4.

## Verification

| Check                                                                            | Result                   |
| -------------------------------------------------------------------------------- | ------------------------ |
| `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build` | pass                     |
| `pnpm run test` (unit)                                                           | 5,119 of 5,119           |
| The pages', the dice's and the phone's journeys, Chromium (146, 48 files)        | 144 passed, 2 then fixed |
| Those two again                                                                  | 4 of 4                   |
| `tests/e2e/book-foot.spec.ts` (new), with axe on the foot                        | pass                     |
| The foot at 1440, 1024 and 390 px, in both books                                 | looked at                |

Not run locally: every other journey, the iPad project and WebKit — CI runs them.

## Next

Stage 1090: the open book on the table.
