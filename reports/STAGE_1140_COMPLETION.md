# Stage 1140 completion — closing the book interface

Work order `work-orders/STAGE_1140.md`; program `docs/BOOK_INTERFACE_PLAN.md`; ADR 0075 §14;
2026-11-23. Status: **the program is implemented; nothing is merged or deployed**. Branch
`claude/stage-1140-closing`, stacked on Stage 1130's.

## What this stage changed

- **The old dock's styles are gone** (`styles/shell.css`, `styles/responsive.css`; its components
  went in Stages 1030 and 1040). Its marker stays for the bookmarks, and `--dock-h` stays as the
  height kept clear at a page's foot.
- **Dead code and words**: three rules no screen draws (`sign-in-divider`, `hub-library-body`,
  `dmb-marks-gap`), two functions nobody calls (`checkValue`, `recomputedNormal`) and 25 Russian
  phrases no screen says any more (old join wording, the dock's "More tools", the old scene's
  words) are removed. Each phrase was looked for in the whole repository before it went.
- **The dark tokens stay**: no token is unused, and the fight's narrow column, the workshop's
  preview, the table's screen and everything outside a page still stand on the dark ground; paper
  is the token scope over it (decision 10).
- **The stack merges in order**: Stage 1020's pull request had three commits more than the stack
  above it (the 56 books' sets among them); Stages 1030–1130 are carried onto its last commit, so
  merging the pull requests one after another meets no file added twice. The stack's content did
  not change by it (only Stage 1020's report differs).

## The acceptance table

The map (`docs/BOOK_INTERFACE_MAP.md`) holds 1,018 controls and views of the product as it was on
2026-11-23. Each now opens inside a book; where a stage left a row as it was inside its page, the
last column says so.

| Book                          | Rows | Stages                       | Left as it was, inside the book                                                                                                                                                                                                                                                                                   |
| ----------------------------- | ---: | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The DM's book                 |  364 | 1030, 1050, 1060, 1070, 1080 | The party's own page, the running head of time and weather, handouts and asks as slips, the Chronicle inside the book, the map as a fold-out, the meeting as a page of the Table, sound and music as its pages, the rules as an appendix (ADR 0075 §7.4, §8.4): each keeps its section's form on the book's paper |
| The DM's and the hero's books |  232 | 1030, 1040, 1070, 1080       | As above, where both books share the section                                                                                                                                                                                                                                                                      |
| The manuscript                |  125 | 1110, 1120, 1130             | Accepting an AI edit's marks one by one (needs a new request, decision 12); the preview as the books' shell itself; unread marks per scenario object; the inspector's quick corrections keep their form                                                                                                           |
| A piece of every book         |  101 | 1020, 1030, 1080             | —                                                                                                                                                                                                                                                                                                                 |
| The hero's book               |   98 | 1040, 1070                   | As for the DM's book where shared                                                                                                                                                                                                                                                                                 |
| The shelf                     |   82 | 1100                         | The ready adventures have no cover picture; the shelf's books are not ordered or grouped                                                                                                                                                                                                                          |
| The open book on the table    |   16 | 1090                         | The players' "Table screen" online keeps the casts inside its page as before; the TV remote was not driven                                                                                                                                                                                                        |

How the rows were proved: by the journeys, which reach every section through the books (every
Chromium journey passes on this branch, see below), and by each stage's screenshots and layout
audit at four widths. The rows were not ticked one by one against the running app.

## What every stage left, in one place

- **1030, 1040**: the rehearsal on the owner's tablet before they are deployed — the DM and the
  players have no dock from these stages on.
- **1050**: a built-in adventure's written book stays closed until the owner reads it; meanwhile
  the book assembled from its world opens.
- **1070, 1080**: the deferred pages listed in the table (ADR 0075 §7.4, §8.4).
- **1090**: the players' online "Table screen"; the TV shell's remote and sound not driven.
- **1100**: the ready adventures' covers; ordering the shelf. Every campaign's set is shipped; the
  campaigns' books were looked at through the journeys' axe passes and a few screenshots, not
  screen by screen for all 55.
- **1110**: the workshop's header follows the browser's language, as before.
- **1130**: the three manuscript items in the table.

## Not run in the program

- **The iPad project and WebKit** were never run on this machine (WebKit is not installed); CI runs
  them on every pull request.
- **`party-known`** floods the local ports; CI runs it.
- **The native apps' device journeys** in a simulator: not run; the native shell's journeys run in
  Chromium with the stand-in shell.
- **A real table**, Layer 2 of the story and the clue command remain outside the program, each
  needing the owner's own word (the plan's "Not in the run").

## Verification

| Check                                                                            | Result         |
| -------------------------------------------------------------------------------- | -------------- |
| `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build` | pass           |
| `pnpm run test` (unit)                                                           | 5,120 of 5,120 |
| `pnpm run context-budget`                                                        | pass           |
| Every Chromium journey but `party-known`, on this branch                         | 385 of 385     |

## The order to merge

Pull requests 78 (1000) → 79 (1010) → 80 (1020) → 81 (1030) → 84 (1040) → 85 (1050) → 86 (1060) →
87 (1070) → 88 (1080) → 89 (1090) → 90 (1100) → 91 (1110) → 92 (1120) → 93 (1130) → this one
(1140), each into the branch below it, after the rehearsal on the owner's tablet; or this branch
into `main` once its CI is green, which holds them all. Deployment is the owner's.
