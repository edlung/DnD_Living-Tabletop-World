# Stage 1190 completion — the shelf

Work order `work-orders/STAGE_1190.md`; ADR 0075 §20; the owner's word
`reviews/OWNER_BOOK_SECOND_PASS_2026-11-25.json`; plan `docs/BOOK_SECOND_PASS_PLAN.md`;
2026-11-25. Branch `claude/stage-1190-shelf`, stacked on `claude/stage-1180-table-screen` (pull
request 101). Status: **implemented; nothing is merged or deployed.**

## What changed for the person at the shelf

| Task                       | Before                                                              | Now                                                                                       |
| -------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Go on with last night      | Every campaign says «Открыть»                                       | The book played last stands first under a ribbon, says when, and its door is «Продолжить» |
| Find a book for this table | Fifty-three books in one list, a tale for 8+ beside horror for 21+  | Six shelves by age under brass plates, the youngest first; the ages an index at the head  |
| Scroll the library         | About 5,200 px of it at 1440 × 900                                  | About 2,300 px: a shelf is one row; «Вся полка: 17» unfolds it                            |
| Look inside a book         | Press the book, or a button on a paper card that repeated its title | The book with its caption is one press                                                    |
| Decide whether to start it | The pitch                                                           | The pitch, «Сколько играть» and «Тон», in the author's words                              |
| Pick the party size        | Under the pitch, off the page on a tablet when the pitch is long    | At the page's foot with «Начать», always in view                                          |

The shelf at 1440 × 900 is 4,613 px tall, 5.1 screens (it was 7,362, 8.2); on the tablet 4,535 px;
on a phone 4,436 px.

Which book is gone on with: the one whose last evening is the latest — by the instant it ended,
or began while it still runs. The server tells it (`AccountCampaign.evening`); a session left
open for a week does not outrank a book played yesterday. A campaign no evening was played in is
opened as before.

## New phrases of the interface (the session's, for the owner to read)

«Продолжить», «Продолжить: {кампания} — {кто}», «Вечер идёт с {день}», «Играли {день}»,
«Возраст» (before the index), «Полки по возрасту» (the index's name for a screen reader),
«Возраст {8+}», «Вся полка: {N}», «Свернуть полку», «Сколько играть», «Тон»; and the library's
opening line now reads «Готовые кампании со своими картинами, фигурками и картами боёв — на
полках по возрасту. Нажмите на книгу, чтобы заглянуть в неё и выбрать число игроков: кампания
начнётся как написана, а мастером будете вы.» What stands under «Сколько играть» and «Тон» is
each campaign's own text, already in its library entry.

## Files

New: `apps/web/src/session/shelf-order.ts` and its test, `styles/shelf-order.css`,
`apps/server/src/accounts/shelf-evening.test.ts`. Changed: `session/hub-campaigns.tsx`,
`hub-library.tsx`, `library-look.tsx`, `shelf-book.tsx`, `styles/shelf.css` (the look page's
foot), `main.tsx`, `i18n/ru-accounts.ts`; `apps/server/src/accounts/accounts.ts` (`eveningOf`);
`packages/contracts/src/session/accounts.ts` (`evening`, optional); journeys `hub-library`,
`accounts`, `campaign-book-hub`.

## Verification

| Check                                                          | Result                              |
| -------------------------------------------------------------- | ----------------------------------- |
| `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check` | pass                                |
| `pnpm run context-budget`                                      | pass                                |
| `pnpm run test` (unit)                                         | 5,135 of 5,135                      |
| Chromium, every journey but `party-known` and the voice        | 391 of 392 in the run; 392 with one |
| The iPad project (WebKit), in the same run                     | 30 of 31 in the run; 31 with one    |

The whole run was made on this branch after its last change. Two journeys failed in it, neither
on the shelf: in Chromium `encounters` (a foe the DM moved was not on its square within fifteen
seconds), in the iPad project `campaign-end` (the DM's closing words were not in the block after
the campaign was finished). Each then passed alone, twice. The run before this stage had one such
failure of another journey; a machine doing other work beside the run is the likely cause, and no
change of this stage is near either screen. Before the run the fifteen journeys that go through
the shelf ran alone: 21 of 21 after the two expected renames.

Looked at by eye at 1440 × 900, 1024 × 768 and 390 × 844 on the audit's own servers: the shelf
with the book gone on with, the library folded and a shelf unfolded, a book looked inside. The
layout audit (`ui-layout-audit`) of the shelf at the three sizes is clean.

Not run: `party-known`, `voice.spec.ts`, the `webkit` project of the release journeys, the native
shells, a real tablet.

## Left

- The shelf is still about five screens when every part is counted: the account's page ends it
  (about 800 px), and the two ready adventures keep their paper labels with a button a language.
- A caption shows a book's kind of story whole, so a row is as tall as its longest caption.
- The date under the book gone on with is the day its last session was closed, or opened while
  it runs; a campaign played without sessions has none and is opened.
