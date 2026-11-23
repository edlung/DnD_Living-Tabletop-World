# Stage 1020 completion — the book kit, paper and each book's materials

Work order `work-orders/STAGE_1020.md`; program `docs/BOOK_INTERFACE_PLAN.md`; ADR 0075 §2;
2026-11-23. Status: **implemented; the program continues with Stage 1030.** Branch
`claude/stage-1020-book-kit`, stacked on Stage 1010's.

**On whose word.** The demo accepted with «Принимаю, дальше», and «каждая книга имеет свой стиль,
согласно арту содержимого … картинки кампании и книги (страницы, переплет, иконки) должны выглядеть
гармонично» (2026-11-23, `reviews/OWNER_BOOK_INTERFACE_2026-11-23.json`).

## What changed

- **Each book's set.** Codex CLI draws, for every library campaign, its binding, paper, ribbon,
  dice tray and the icons of the eight parts, with the campaign's cover and two of its pictures as
  the style reference (`~/Documents/living-tabletop-world-art/book-sets-2026-11-23/`,
  `make_prompts.py`, `gen.py`, `assemble.sh`). The three books of the demo keep their sets, with
  moment icons, a divider and an emblem as well.
- **The pipeline.** `scripts/book-materials/build.ts` converts the originals to
  `apps/web/public/book-materials/<theme>/` and writes `apps/web/src/visual/book-materials/`
  (manifest with digests; a stylesheet giving each campaign's theme `--book-cover`, `--book-paper`,
  `--book-ribbon`, `--book-tray`, `--book-divider`, `--book-emblem`). Generated, never edited.
- **The kit.** `apps/web/src/book-kit/`: the materials' names and the open book's theme
  (`materials.ts`, provided by the session's shell), the part and moment icons and the ribbon
  (`kit.tsx`), `styles/book-kit.css`.
- **Paper.** `[data-surface='paper']` in `styles/tokens.css`: inks, edges, glass and status
  colours for a page, every ink at 4.5:1 or better on the darkest parchment.
- **The DM's book dressed.** Its bookmarks show the icons of their parts in the campaign's style,
  its moments the moment icons, its pages the campaign's paper, its spread the binding, the party's
  place the ribbon. A campaign without a set keeps its theme's material and the product's glyphs.
- **CI**: journeys in four shards.

## Session's decisions in this stage

- A set is 12 pictures (binding, paper, ribbon, tray, eight parts). Moment icons, dividers and
  emblems for the other campaigns wait for the stages that show them (1050, 1070).
- Without a written style, a campaign's prompt asks for the style of its attached pictures and
  names its title, genre and pitch; with one (`assets/prompts.json`), its own style is used.
- Story, Journal and Rules are told apart in the prompts (an open great book; a pocket notebook
  with a pencil; not a book — scales, an instrument, a seal) after the first trial drew three
  similar books.

## Verification

| Check                                                                                                                                                 | Result                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run typecheck`                                                                                                                                  | pass                                                                                                                      |
| ESLint on the changed code                                                                                                                            | pass                                                                                                                      |
| `pnpm run format:check`, `pnpm run context-budget`                                                                                                    | pass (2,957 files)                                                                                                        |
| `pnpm run test` (unit)                                                                                                                                | 5,111 of 5,111                                                                                                            |
| `tests/ui-kit/paper-tokens.test.ts`                                                                                                                   | every paper ink ≥ 4.5:1 on `--page` and `--page-floor`; a field's edge ≥ 3:1 (two inks were darkened after the first run) |
| `tests/ui-kit/book-materials.test.ts`                                                                                                                 | every named piece shipped byte for byte; only catalogue themes; no book borrows another's set                             |
| Journeys `dm-book`, `dm-book-library` (with a new check of the book's own icon), `dock-fit`                                                           | 8 of 8, Chromium and iPad                                                                                                 |
| The dressed book at 1440, 1024, 768 and 390 px in the lighthouse (full set), the moon pearl and the ash testament (no set yet), screenshots looked at | the icons and paper read at every width; nothing moved                                                                    |

## Open

- The sets of the remaining campaigns are being drawn when this report is written (600 pictures,
  seven at a time); they are added to this pull request by running `assemble.sh` and the build
  script, and checked by the same tests. Until a set exists the campaign looks as before.
- The paper scope is used by the DM's book only; the shell of Stage 1030 puts every section on it.

## Next

Stage 1030: the DM's book becomes the DM's screen.
