# Stage 1170 completion — the Party and the Table by tasks

Work order `work-orders/STAGE_1170.md`; ADR 0075 §18; the owner's word
`reviews/OWNER_BOOK_SECOND_PASS_2026-11-25.json`; plan `docs/BOOK_SECOND_PASS_PLAN.md`;
2026-11-25. Branch `claude/stage-1170-pages-by-tasks`, stacked on
`claude/stage-1160-fight-foldout` (pull request 99). Status: **implemented; nothing is merged or
deployed.**

## What the DM has now

| Task                              | Before                                                             | Now                                                                                         |
| --------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Begin the evening                 | At the table › Session, one of eight blocks, the third on the page | «Вечер ещё не начат. → Начать вечер» on the Scene; the start is first on the Session's page |
| Call a rest                       | World › Time and weather (and the Scene's seal since Stage 1150)   | Also on the Party's page, right under the heroes' health                                    |
| Award experience, ask for a check | The Party's page, among traps and diseases                         | The Party's page: health, rest, experience, a check, a ruling, a handout                    |
| A trap, stress, a contagion       | The Party's page of every campaign, a family story included        | The heroes' appendix («Приложение»), one press from the Party's page                        |
| The days between adventures       | The Party's page                                                   | The heroes' appendix                                                                        |
| Whose dice the table rolls        | Session › "At the table"                                           | At the table › «Настройки»                                                                  |
| The campaign's options            | The foot of the Session's page                                     | At the table › «Настройки»                                                                  |

Every tool keeps its form, its words and its command; only its page changed. The table's
agreement, the pause and the music are still in Session and a check is still asked in Party, so
"How to run the game" and the agreement's own hints stay true.

## New phrases of the interface (the session's, for the owner to read)

«Приложение», «Приложение (мастер)», «Настройки», «Настройки стола (мастер)», «Кубики стола»,
«Вечер ещё не начат.», «Начать вечер». Every other word was in the product.

## Files

New: `apps/web/src/dm/appendix-sheet.tsx`, `table-settings-sheet.tsx`,
`tests/e2e/pages-by-tasks.spec.ts`. Changed: `dm/party-sheet.tsx` (the rest's place; the rare
tools gone), `dm/session-sheet.tsx` (the start first; the dice and the options gone),
`dm/dm-sheets.tsx` (the mounts), `shell/book-parts.tsx` and `shell/use-shell.ts` (the pages),
`book/work-spread.tsx` and `work-story.tsx` (the evening's offer), `report/trouble-words.ts`,
`styles/work-spread.css`, `i18n/ru-book.ts`, `packages/contracts/src/session/client-errors.ts`
(`CLIENT_PARTS` gains `appendix` and `settings`), `apps/server/src/testing/ui-ru-campaigns.ts`
(the journey's campaign); journeys `toolbox`, `crafting`, `campaign-options`, `own-dice`,
`dm-book-library` (the page a tool is on).

## Verification

| Check                                                                        | Result         |
| ---------------------------------------------------------------------------- | -------------- |
| `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`               | pass           |
| `pnpm run context-budget`                                                    | pass           |
| `pnpm run test` (unit)                                                       | 5,127 of 5,127 |
| Chromium and the iPad project, every journey but `party-known` and the voice | 422 of 422     |

The whole run was made on this branch after its last change, so it also covers the fight stage
under it (pull request 99) after that stage's fixes. Before it, five journeys that reached a
moved tool were pointed at its new page.

Looked at by eye at 1024×768 on the lighthouse's campaign: the Party's page, the appendix, the
Session's page, the settings, the Scene between sessions with the evening's offer. Not run:
`party-known`, `voice.spec.ts`, the `webkit` project of the release journeys, the native shells,
a real tablet.

## Left

- The Session's page still holds seven blocks; the evening's start is the first.
- A trap's result shows on the heroes' cards, a page away from its form.
- The contract's list of parts grew by two names: a client newer than its server would have a
  report from those two pages refused until the server is deployed with it (they deploy
  together).
