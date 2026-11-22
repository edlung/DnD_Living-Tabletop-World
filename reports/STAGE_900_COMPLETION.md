# Stage 900 completion — the DM's book, foundation

Work order `work-orders/STAGE_900.md`; program `docs/DM_BOOK_PLAN.md` (section 900); ADR 0074 §1;
2026-11-22. Status: **implemented, the program continues** (the owner chose Stages 900–930 without
stops; the report to him is at the end of 930). Branch `claude/stage-900-dm-book-foundation`,
stacked on `claude/campaign-editorial-2026-11-22`
(https://github.com/edlung/DnD_Living-Tabletop-World/pull/72).

**On whose word.** The owner's, typed on 2026-11-22 in the session that did this work: the brief
of the book, «Да, развиваем» to the demo, «мне для всех компаний книжный формат нужен … 55
кампаний» to the first plan, «Да, открываем» to Stages 900–930, and four choices in a question
card. All of it is quoted in `reviews/OWNER_DM_BOOK_2026-11-22.json`. Points marked (S) in the
plan and in the ADR are the session's and stay his to overrule.

## What changed

Documents only; no code, no contract, no package, no migration.

- **The record** — `reviews/OWNER_DM_BOOK_2026-11-22.json`: the owner's words, what he was shown,
  his four choices, which stages are authorized and which are not.
- **The program** — `docs/DM_BOOK_PLAN.md`: the owner's checklist of nine points for Stages
  900–930, the two layers (the book from what a campaign already has; enrichment later), where
  the product stands today area by area, Stages 900–950, fourteen decisions with their authors,
  the boundaries.
- **ADR 0074 §1** — what the book is: a view and not a second game; prepared is not decided; the
  DM's alone; two layers; no model at the table; a gap is shown; beside the dock; the DM's place
  in the book is his own state; the words chapter and meeting; all campaigns. The index row in
  `docs/adr/README.md`.
- **Four work orders** — `work-orders/STAGE_900.md`, `STAGE_910.md` (the book's data),
  `STAGE_920.md` (the book to read), `STAGE_930.md` (play from the book).
- **The accepted sample** — `docs/design/dm-book-sample/`: a README (what each file is, what to
  take, what is a demo's shortcut and must not be carried over, what the demo found in the
  campaigns' data), the archive of the demo's sources as published, four screenshots.
- **The second concept**, made the same day in another session, committed unchanged:
  `docs/design/dm-book/` and `work-orders/DM_BOOK_CONCEPT_2026-11-22.md`. What is taken from it is
  listed in the plan under Stage 900.
- **The entry points** — the owner's paragraph in `AGENTS.md`, the section in
  `docs/PROJECT_WORKFLOW.md`, the row and the line in `docs/AI_CONTEXT_MAP.md`.

## Before the stage: the editorial work

The owner's first choice in the question card. The work another session left uncommitted on
2026-11-22 (4,317 files: 926 changed, 3,391 new) is on `claude/campaign-editorial-2026-11-22`,
pull request 72, exactly as it was; `docs/design/dm-book/` and its work order were held back for
this stage. Checked on that tree: format, typecheck, the context budget and lint pass; unit 4,905
of 4,906 — `scripts/campaign-library/library.test.ts` › "ships exactly what the campaigns build
now" exceeds the 5 s default when the whole suite runs (three runs of three) and passes alone in
1.7 s. Not fixed there, because that work was to be committed as it is; Stage 910 rebuilds the
library and gives the test the room it needs.

## Session's decisions in this stage

- Plan decisions 9–14 and ADR 0074 §1.7–§1.9 (each marked (S)).
- Stage numbers 900–950: the next free block after 890.
- The sample is an archive, not a tree of files: the demo's engine is one 747-line script, over
  the 700-line ceiling of the context budget, and it is a thing to look at, not to maintain. Its
  generated data (415 KB) and pictures (about 150 files) are not committed; the README says how
  they were built.

## Verification

| Check                                                   | Result                                                                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `pnpm run format:check`                                 | pass                                                                                                               |
| `pnpm run lint`                                         | pass                                                                                                               |
| `pnpm run typecheck`                                    | pass                                                                                                               |
| `pnpm run context-budget`                               | pass (2,906 files)                                                                                                 |
| `pnpm run test` (unit)                                  | 4,905 of 4,906; the one red is the load timeout named above, unchanged by this stage                               |
| Every repository path named in the new documents exists | pass (a script of the session; paths inside a campaign, inside the archive and of Stage 920's future folder aside) |
| The archive opens and lists the files the README names  | pass (16 files)                                                                                                    |

Not run: integration, build, journeys — the stage changes no code.

## Risks and what is open

- The stage stands on pull request 72, which the session did not write and reviewed only by the
  checks above.
- The numbers in the plan (434 chapters, 1,323 scenes, 1,177 scenes that name a person, about 38
  campaigns whose scene text speaks to the DM) were read from the sources on 2026-11-22 by a
  script of the session; Stage 910 turns the first three into tests.
- The demo's page is the owner's private page; the archive is the copy that stays with the
  repository.

## Next

Stage 910, `work-orders/STAGE_910.md`: the book's data in the package contract and in every
campaign's build.
