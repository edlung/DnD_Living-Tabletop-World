# Stage 1170 — the Party and the Table by tasks

Authorized by the owner on 2026-11-25: «Реализуй весь план до конца»
(`reviews/OWNER_BOOK_SECOND_PASS_2026-11-25.json`, `docs/BOOK_SECOND_PASS_PLAN.md`). The plan's
words for this step: «Герои и „За столом“ по задачам. Отдых и опыт рядом со здоровьем отряда;
вечер отдельно от настроек кампании; редкие инструменты — в приложение». ADR 0075 §18. Stacked
on `claude/stage-1160-fight-foldout` (pull request 99).

## Why

Read in the running product: the Party's page of a family story for ages 8+ showed "Sewer
Plague", "Mental stress" and a collapsing roof beside the heroes' health, and a rest was called
from World › Time and weather. The Session's page laid the evening's start among eight blocks,
with the campaign's options and whose dice the table rolls. Between sessions nothing on the
DM's main screen said the evening had not begun.

## Scope

- **The Party's page holds what every evening does** (`dm/party-sheet.tsx`): the heroes' cards,
  then the party's rest (the same controls as on Time and weather, which keeps them), experience,
  a check asked, a ruling recorded, a handout given.
- **The heroes' appendix** (`dm/appendix-sheet.tsx`, a new page of the Heroes' part): a trap
  sprung, a mind under stress, a contagion, the days between adventures. Each tool is as it was:
  its words, its form's name, its command.
- **The Session's page is the evening** (`dm/session-sheet.tsx`): the evening's start, or the
  session that runs, heads it; then the list before the first evening, the evening's words, the
  next game, the adventure's end, the table's agreement, the music, who is at the table.
- **The table's settings** (`dm/table-settings-sheet.tsx`, a new page of the Table's part):
  whose dice the table rolls, and the campaign's options.
- **The evening begins from the Scene**: between sessions the working spread's story page says
  «Вечер ещё не начат.» with «Начать вечер», which opens the Session's page at its start.
- A report of a broken screen can name the two new pages (`CLIENT_PARTS` of
  `packages/contracts/src/session/client-errors.ts` gains `appendix` and `settings`, as it gained
  `book` in Stage 920): the one contract change of the plan so far.

Unchanged: every tool's own form, words and command; the table's agreement and "How to run the
game", which say where things are, stay true (the agreement, the pause, the music are still in
Session; a check is still asked in Party).

## Journeys

- `tests/e2e/pages-by-tasks.spec.ts` (Chromium; campaign `ui-ru-pages`): the Session's page with
  the session that runs and without the settings, the settings' page, the party's rest called and
  ended on its page, the appendix with its tools; axe on the two new pages.
- `tests/e2e/dm-book-library.spec.ts`: a campaign just started says the evening has not begun and
  leads to its start.
- Journeys that reach a moved tool open its new page: `toolbox`, `crafting` (the appendix),
  `campaign-options`, `own-dice` (the settings). Nothing else of them changes.

## Known limits

- The Session's page still has seven blocks; the start is the first of them.
- The dice's choice is a campaign's setting, on the settings' page; who is absent tonight stays
  with the evening.
- A trap's result shows on the heroes' cards, a page away from its form (and in the result's
  notice, on any page).

## Out of scope

The table's screen, the shelf, a player's phone, new book materials (Stages 1180–1210). Merging
and deployment stay the owner's.
