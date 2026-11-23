# Stage 1010 completion — the demo of all the books

Work order `work-orders/STAGE_1010.md`; program `docs/BOOK_INTERFACE_PLAN.md`; ADR 0075 §1;
2026-11-23. Status: **done; HARD STOP for the owner's look, corrections and acceptance.** Branch
`claude/stage-1010-book-demo`, stacked on Stage 1000's (pull request 78).

**On whose word.** «Сначала демо всех книг», «Да, открываем. Для генераций красивых книжных
ассетов интерфейса обращаемся к Codex CLI.» and «каждая книга имеет свой стиль, согласно арту
содержимого … картинки кампании и книги (страницы, переплет, иконки) должны выглядеть
гармонично» (2026-11-23, `reviews/OWNER_BOOK_INTERFACE_2026-11-23.json`).

## What was made

- **The demo**, the owner's private page: https://claude.ai/artifact/JjaysGsEkmvKUfnsZrQ6h5 (version 3). Five books on one state — the shelf, the DM's
  book (seven parts, three campaigns), the hero's book on a phone, the open book on the table, the
  manuscript — and A–Z, the 1,018 controls of today with where each goes. What each frame holds:
  `docs/design/book-interface/README.md`.
- **48 book pictures** by Codex CLI: the product's set (shelf, desk, bookplate, cover, tray, tab,
  proof marks, seal, quill, nine part emblems) and a set for each of `lighthouse`, `rain-check` and
  `marrow-crown` in that campaign's own style (eight part icons, a ribbon, a dice tray). Originals
  and prompts in `~/Documents/living-tabletop-world-art/book-interface-2026-11-23/`.
- **In the repository**: `docs/design/book-interface/` — the README, the archive of the demo's
  sources and tools, screenshots.

## Session's decisions in this stage

- Three campaign books instead of the two of the work order, after the owner's words on style:
  family gouache, noir and dark fantasy show how far one engine re-dresses.
- Spines on the shelf are cut from each campaign's own cover and bound in its material and accent,
  so the library's 53 books look like their campaigns before their own sets exist.
- The manuscript is dressed as its campaign (`rain-check`); the desk keeps the product's set.
- The DM's left page turns in screens (columns as wide as the page); on a phone the pages stack and
  scroll.

## Verification

| Check                                                                                                                                 | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every frame rendered headless at 1440×900, 1024×768, 768×1024 and 390×844 (27 states, 46 screenshots, `tools/shot.mjs`) and looked at | no page errors, no horizontal scroll                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Harmony, each of the three books: its campaign's pictures beside its binding, paper, icons, ribbon and tray                           | one set each; nothing of one book's set inside another's (also the reviewer's finding)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Independent walk by a separate reviewer (DM, player on a phone, author, harmony; Nielsen, Fitts/Hick, WCAG 2.2 AA)                    | 22 findings; fixed: the phone's tabs off screen, the DM's book cut at 390 px, the fight showing the page through it (now opaque, the page inert), the TV's fight without figures and the empty preview, toasts over actions, the noir lettering's Cyrillic «В», the roll slip over the text, «Стол» meaning three things (now «Экран стола», «За столом»), «Начать встречу» as a button, a rule search and index, empty right pages (meeting timeline, who sits at the table), numbered foes, class and weapon names in Russian, «Закладка», «Увеличить», «Закрыть», one word «Мастерская», targets to 40–44 px, clamped descriptions, the roll's answer beside its check, binding disabled until the warning is accepted, shelf rows by width |
| The published page opened in the owner's Chrome (shelf and the dark-fantasy book)                                                     | loads with its pictures                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Contrast                                                                                                                              | judged by eye on paper and bindings; not measured (the reviewer's script could not read `color-mix` values)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

Left as the reviewer found them, for the owner's look: actions of a long right page still scroll at
1024×768 (the plate is lower, the check's buttons are close to the fold); the A–Z rows keep the
inventories' English where no Russian word was found; the built-in Hollowmere stands on the shelf
as a material with its title (no cover art exists); handouts are given to the whole party, as the
product gives them.

## Not shown, and why

- The players' online "Table screen", voice, music, the cheers, the next game, the Chronicle's
  writing, the shop, acting for a hero, the level-up and the picture queue are named on their
  pages and answer with a line of what they would do.
- Sign-in by invitation, a password reset, development personas, privacy and "something broke" are
  rows of A–Z without a page in the demo.
- Book sets for the other 52 campaigns: the plan makes them in the stages that need them (1020,
  1100), each in its campaign's style.

## Next

The owner's look. His corrections rewrite Stages 1020–1140 before any of them starts; none is
authorized yet.
