# Stage 1040 completion — the hero's book

Work order `work-orders/STAGE_1040.md`; program `docs/BOOK_INTERFACE_PLAN.md`; ADR 0075 §4;
2026-11-23. Status: **implemented; not merged, not deployed** (with Stage 1030 it waits for the
owner's rehearsal on his tablet). Branch `claude/stage-1040-hero-book`, stacked on Stage 1030's.

## What changed

- **No dock for anyone.** A player's screen is the hero's book: five bookmarks in the campaign's
  icons — Сцена, Герой, Мир, Журнал, За столом — and the open part's pages as tabs (World: Places;
  Journal: Journal, Chronicle; At the table: Dice, Chat, the table's screen online, Rules). On a
  phone the bookmarks run along the bottom. `shell/dock.tsx`, `dock-more.tsx` and
  `use-dock-fit.ts` are gone; `shell/book-parts.tsx` builds both books' parts.
- **What waits marks its bookmark**: a check the DM asked marks At the table and its Dice, a
  handout the Journal, a message the talk (ADR 0075 §4.2).
- **The hero's sheet** opens from the Hero bookmark, on the book's paper; it stays the dialog it
  was (unsaved words still ask before it closes) until the Heroes spread of Stage 1070.
- **Every section a player opens is on the book's paper** inside the campaign's binding.
- **A player's fight** keeps the whole stage: with no page open the Scene's one tab steps aside and
  the bookmarks run as a small bar along the bottom, where the battle's layout keeps room.
- **A reaction asked of the viewer comes first**: an open book, hero sheet or page steps aside,
  keeping its place, and the question takes focus.
- **The scene keeps room for its names** beside the bookmarks: on a laptop beside the selection's
  column (1101–1439 px) the bookmarks give up their words; no dock height is kept under the stage
  on a tablet or desktop; held upright, a tablet's row of who is present stands above a result
  (the ways beyond rise under the image's note); held wide, the result is narrower so the row
  keeps three a line; the quiet row («Что я могу?», «Попросить паузу») stays clear of the place's
  card under the page's tabs.
- **Journeys**: `tests/e2e/support/shell.ts` reaches every section through its part (players
  too); `tests/e2e/hero-book-parts.spec.ts` replaces the dock's fit journey; the journeys that
  waited for the dock wait for the book's parts; `tests/e2e/AGENTS.md` says how.

## Found and fixed while checking

- Combat clicks were caught by the empty stretch of the page-tab strip; only the tabs take a press
  now.
- A player's battlefield was squeezed by the side bookmarks; in a fight they become a bottom bar.
- The reaction prompt lay under an open Journal page (the Chronicle was open through its part):
  the page now steps aside for it.
- Beside the selection's column at 1280 px the scene's row ran under «Beyond this place»; on an
  upright tablet one medallion a line ran off the top of the page; on a tablet held wide the row
  stood over the place's card; the quiet row covered the place's date. Each is measured by
  `tests/e2e/scene-result-layout.spec.ts` or was looked at in screenshots at 1440, 1280, 1024 and
  768 px.

## Session's decisions in this stage

- The hero's sheet stays a dialog until Stage 1070 (above).
- Slips between pages (ADR 0075 §1.2) and the builder as the first pages of a hero's book move to
  Stages 1070–1080 with the parts they belong to; until then what waits marks its bookmark.
- The iPad and Android shells' Back is the client's Escape (`web/src/native/back.ts`), which closes
  the topmost page as before; the bottom bar keeps the safe area. No native screen was rebuilt and
  no device was driven in this stage.

## Verification

| Check                                                                            | Result                                                                                |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build` | pass                                                                                  |
| `pnpm run test` (unit)                                                           | 5,111 of 5,111                                                                        |
| Every journey, Chromium (364), after Stage 1030's fight fix                      | 364 passed, over several runs (below)                                                 |
| The iPad project and WebKit                                                      | left to CI (below)                                                                    |
| The hero's book at 1440, 1280, 1024 and 768 px, screenshots looked at            | the scene, a result and the selection's card clear of the bookmarks and of each other |

The Chromium journeys ran in several parts: another session ran its journeys on the same fixed
ports in the main checkout, and `party-known` floods a local server's connections (thousands of
sockets left waiting, `EADDRNOTAVAIL`), so two runs were cut short. Every journey was run to the
end at least once on this stage's final code; eight that timed out while the machine was
overloaded (`toolbox`, `turn-hint`, `weapons`, `release`) passed when run again alone, and the 37
the cut runs had not reached passed in a run of their own. The iPad project's local run was cut
by the same flood; CI runs it with WebKit.

Three journeys (`encounters`, `marks`, `party`) first failed here and were put down to the
worktree; CI showed they failed on Stage 1030 as well. The cause was in Stage 1030 (the fight's
panel inset twice by the book) and is fixed there; this stage carries the fix for both books.

## Open

- **Rehearsal before deployment** on the owner's tablet, with Stage 1030.
- The 56 books' sets were drawn during this stage and are in Stage 1020's pull request.

## Next

Stage 1050: the Scene and the Story.
