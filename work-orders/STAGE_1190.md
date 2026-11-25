# Stage 1190 — the shelf

Authorized by the owner on 2026-11-25: «Реализуй весь план до конца»
(`reviews/OWNER_BOOK_SECOND_PASS_2026-11-25.json`, `docs/BOOK_SECOND_PASS_PLAN.md`). The plan's
words for this step: «Полка. Подписанные полки, „Продолжить“ у текущей книги, без восьми экранов
прокрутки». ADR 0075 §20. Stacked on `claude/stage-1180-table-screen` (pull request 101).

## Why

Read in the running product at 1440 × 900: the shelf is 7,362 px tall, more than eight screens.
Fifty-three library books stand in one undivided list, a tale for ages 8+ beside horror for 21+;
each book carries a paper card with its title a second time and its own button. The account's
own campaigns all say «Открыть»: nothing tells which one the table played last night.

## Scope

- **The book gone on with** (`session/shelf-order.ts`, `hub-campaigns.tsx`): the campaign whose
  last evening is the latest (ended, or begun and still running) stands first on the account's shelf under a
  ribbon, says «Вечер идёт с {день}» or «Играли {день}», and its door is «Продолжить», the shelf's one
  first press; the other books' doors stay «Открыть». A campaign no evening was played in is
  opened as before. The server tells the last evening (`AccountCampaign.evening`: the real
  instant it ended, or began while it runs — `accounts/accounts.ts`, `eveningOf`).
- **Shelves by age** (`session/hub-library.tsx`): the library's books stand on shelves by the age
  they are written for, the youngest first, each under a brass plate «Возраст 8+». A shelf shows
  one row; «Вся полка: N» in its head unfolds it and «Свернуть полку» folds it.
  The ages are an index at the library's head: a press comes to the shelf.
- **A book's first page says what a DM asks before choosing** (`session/library-look.tsx`): how
  long the campaign plays and its tone, as its author wrote them («Сколько играть», «Тон»); the
  party size and the start stay at the page's foot while a long page scrolls above them.
- **A library's book is one press**: the book and its caption — the title in the book's own
  lettering and what kind of story it is — are one button, "Look inside the book «…»". The paper
  card with a second title and a button of its own is gone from the library.

Unchanged: the first page a book opens at ("look inside"), the party size, the start; the ready
adventures and their language buttons; the finished adventures' shelf; the account's page.

## Contract

`AccountCampaign` gains `evening?: { at, running } | null` — optional, as `place` was in Stage
1100: a client reads a server from before it, and a server's answer is read by a client from
before it.

## Journeys

- `tests/e2e/hub-library.spec.ts`: the shelves by age with their plates, one row and the whole
  shelf, the index, a book looked inside and started; back on the shelf the started campaign has
  no evening and is opened, the one whose evening runs is gone on with.
- `tests/e2e/accounts.spec.ts`, `campaign-book-hub.spec.ts`: the door of a campaign whose evening
  runs is "Continue".
- Unit: `apps/web/src/session/shelf-order.test.ts`, `apps/server/src/accounts/shelf-evening.test.ts`.

## Known limits

- The shelf is still several screens when every book is counted; a shelf folds to one row.
- A book's kind of story is shown whole under it: rows of a shelf are as tall as their longest
  caption.

## Out of scope

A player's phone, new book materials (Stages 1200–1210). Merging and deployment stay the owner's.
