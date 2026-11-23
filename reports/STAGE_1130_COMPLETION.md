# Stage 1130 completion — the manuscript: the co-author, the plates, the binding

Work order `work-orders/STAGE_1130.md`; program `docs/BOOK_INTERFACE_PLAN.md`; ADR 0075 §13;
2026-11-23. Status: **implemented in part; not merged, not deployed**. Branch
`claude/stage-1130-binding`, stacked on Stage 1120's.

## What changed

- **Generation and activation are on the manuscript's paper** (`workshop/editor.tsx`); only the
  world preview keeps the game's dark ground.
- **The proposed pages are marked until read**: each finished step of a generation says "Not read
  yet" until its result is opened, then "Page read" (`generation/read-pages.ts`, `job.tsx`). New
  words: "Not read yet" («Ещё не прочитано»), "Page read" («Прочитано»). The marks live while the
  draft is open, in memory only — the workshop keeps nothing of a draft in the browser.
- **An AI edit is a proofreader's marks**: in its review what it would take out is struck through
  in red, what it would put in is underlined with a rule in the margin (`comparison/review.tsx`,
  `changes.tsx`, `styles/workshop-binding.css`).
- **The draft's pictures are plates** in a thin gilt frame on a dark mount.
- **The world preview is the proof copy**: its line "Preview only. Looking around does not move
  anyone or record played events." stands as the proof's stamp over the game's own views.
- **Activation is binding**: the checks and consent on paper; once bound, the campaign's book in
  its binding stands in the activation (`activation/status.tsx`), as on the desk.
- **A bound draft plays like a library campaign with its DM's book**: this was already served since
  Stage 1050 (`book/book-source.ts`: the library's book of the package, else one assembled from
  it); the Russian activation journey now opens that book after entering.

## Found and fixed while checking

- The finished steps' new marks first split each step's line, leaving "· Step completed" at a
  line's start (the layout audit's `separator-at-line-start`): the line is whole again, the mark
  and the button below it.
- The proofreader's marks first reached only list values; a single text stood unmarked: every
  value of a side is marked now.
- The proof's stamp in capitals read as shouting a long sentence: it keeps the sentence's case.

## Not in this stage

- **Accepting or refusing one mark at a time**: the editing contract applies an AI edit whole;
  marks one by one would need a new request, which this program does not add (ADR 0075 §13.2,
  decision 12). The review accepts or refuses the proposal whole, as before.
- **The preview as the DM's and the hero's books themselves**: the proof copy shows the game's own
  scene and board views and the character preview as before, not the book shell around them.
- **Unread marks inside the proposal's contents** (per scenario object): only a generation's steps
  carry them.
- The pictures' plates were looked at only where the fixtures have no pictures; the frame is a
  border on the existing picture, checked by the pictures journeys' axe passes.

## Verification

| Check                                                                            | Result                                      |
| -------------------------------------------------------------------------------- | ------------------------------------------- |
| `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build` | pass                                        |
| `pnpm run test` (unit)                                                           | 5,120 of 5,120                              |
| `pnpm run context-budget`                                                        | pass                                        |
| Every workshop journey and the two package imports, Chromium (57 in 23 files)    | 57 of 57                                    |
| Generation, an AI edit's review, the preview, activation before and after        | looked at and audited, 1440, 1024, 768, 390 |

Not run locally: the other journeys, the iPad project and WebKit — CI runs them.

## Next

Stage 1140: closing.
