# The book is the whole screen

The owner, 2026-11-25, on the second pass as he saw it running in the app's browser pane:
«Книга должна быть на весь экран. Все элементы должны располагаться если не в книге, то в
закладках. У тебя доступ был к Codex CLI для генерации ассетов. Вышло — радиокнопки, выпадающие
списки, формы ввода и все невероятно корявое в плане верстки»
(`reviews/OWNER_BOOK_WHOLE_SCREEN_2026-11-25.json`). After a first look at the DM's screens
without the bar: «Да, продолжай». ADR 0075 §24. Stacked on `claude/second-pass-review` (pull
request 105). The concept he chose: direction А, a real book.

## Scope

- **No bar above the book** on any screen of a campaign: the cover to the screen's edges, corner
  fittings, the running head (`styles/book-whole.css`); a phone's head as the cover's upper edge
  (`styles/book-phone.css`).
- **The clasp and its slip**: what the top bar held, at every width (`shell/top-bar.tsx` is
  unchanged in what it renders; the journeys open the slip with `openTopMenu`).
- **The dice at the page's foot on paper**, drawn where the book has dice
  (`dice/book-foot.tsx`, `dice/roll-builder.tsx`, `book-kit/materials.ts`).
- **Pages set as a book** (`styles/book-controls.css`): passages, ledger fields, inked choices,
  stamped labels, plates; the ready strip and the acting bar as paper slips.
- **The book from 701 px**: the tablet's book and fight layouts (eight stylesheets and
  `combat/board/board-view.ts`); the fight's map across a narrower page (`styles/fold-out.css`).
- **Pictures by Codex CLI**: a cover's corner fitting and dice for the books
  (`scripts/book-materials/build.ts`: `die-d*`, `cover-frame` from `cover-corner`, dice cut from
  a sheet).
- **The journeys** follow the controls behind the clasp.

## Out of scope

The table's screen, the shelf, the way in and the workshop; the Chronicle's own dialog; a
page's inner layouts beyond how their controls are set; merging and deployment.

## Acceptance

- At 1024 × 768, 1440 × 900, 766 × 799 and 390 × 844 no bar of the application shows on a
  campaign's screen; every control the bar held is reached through the clasp by its old name.
- Static checks, unit tests and the journeys pass.
- Every page of the DM's book and a player's phone are looked at; the layout audit is clean.
