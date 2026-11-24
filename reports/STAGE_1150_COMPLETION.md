# Stage 1150 completion — the DM's working spread

Work order `work-orders/STAGE_1150.md`; ADR 0075 §16; the owner's choices
`reviews/OWNER_BOOK_POLISH_2026-11-24.json`; 2026-11-24. Branch
`claude/stage-1150-working-spread`, stacked on `claude/book-interface-polish` (pull request 97).
Status: **implemented; nothing is merged or deployed.**

## What the DM has now

On a tablet held wide and on a laptop, outside a fight, the Scene is one spread:

| Where                           | Before                                                                             | Now                                                                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| The left page                   | The place's list: its name, the heroes' plates, a card for everyone and everything | The story where the party is: chapter and title, the words read aloud with an initial, "How we play this", the turn          |
| The right page                  | The plate, then "choose someone on the left page" over half an empty page          | The plate; its caption (the place, the hour, the heroes' presence); who and what is here as small plates; five seals         |
| A roll                          | Rules › Dice › "Ask for a check", or a card of the Book under a scroll             | The seal «Бросок»: this page's checks with "ask", then "Ask for another check"                                               |
| A fight                         | Scene › Encounter (a form), or a card of the Book                                  | The seal «Бой»: the fights prepared at this place and the chapter's, "Start this fight", then "Every fight, and your own"    |
| A rest                          | World › Time and weather › Rest                                                    | The seal «Привал»: a short rest, a long rest (or "End the short rest"), then the page of time                                |
| The table's screen              | A button under the Book's picture; Table › Table screen                            | The seal «На экран»: the place's picture, with the words read aloud when they fit, then the screen's page                    |
| A handout                       | Party › "Give a handout" (a form), or a card of the Book                           | The seal «Выдать»: the chapter's handouts with "Give it to the party", then "Write a handout of your own"                    |
| A person's card                 | "Follow a lead: Look at …" first; the description and "Perform" under a scroll     | "By the book" first (how they look and speak, what they want and know, the secret folded), the description, "Perform", leads |
| The card on the page            | Under the plate, over the right page's lower half                                  | In the plate's place: who is here and the seals stay in reach                                                                |
| Lines read on a 1024×768 tablet | 5.5 in the Book before the shell work; the Scene had none                          | 11 on the Scene with "How we play this" folded, 8 with it open                                                               |
| The card on a 1024×768 tablet   | —                                                                                  | A close head (the face, the name); three of the book's facts in view, each its word and its text in one run                  |

A player's Scene, the DM's Scene on an upright tablet or a phone, and a fight are unchanged.

## The DM's tasks, walked

The evening's tasks were walked on the tablet's size as the DM would meet them (the
`user-task-walkthrough` skill; the session's own reading of the running product, no person was
watched): read the next passage aloud; ask for the page's check; look up who someone is; start
the prepared fight; call a short rest; show the place on the table's screen; give a handout; turn
to the next page; find another place's chapter in a campaign with no written text. Each is on
the Scene, at most two presses from the spread. Three gaps were found and closed:

- A seal looked the same whether its page prepared anything: the DM pressed to find out. A seal
  now carries a small tag with the number of rolls to ask, fights to start or handouts to give.
- «Выдать» gave a handout by its title alone, and what is given is the players'. Its text now
  folds under its name in the slip, to be read first.
- «На экран» did not say what would go to the screen. The slip says it is the place's picture.

Left as they are, and for the owner's eye: turning the page on the Scene moves the ribbon (the
Book's reading does not), which the page does not say; a card on the tablet is one plate tall.

## A campaign with no written book

Found while looking at the spread on another book. A built-in adventure's written book waits for
the owner's reading (ADR 0074 §2.8), so in a deployment such a campaign — the owner's own ones —
opens the book assembled from its world (ADR 0075 §5): a chapter a place, the page the place's
description. Half of Ravenford's places have none, and the working spread's left page stood blank
under "tell it in your own words".

- A page with no words says so and lays out what the book holds of it: the page's notes, who is
  here as the campaign describes them, what can be found here (`book/work-brief.tsx`). Nothing is
  written for the gap. A name there is a word, not a control: the plate on the right page opens
  the card, and one person is one button on a spread.
- When the Scene shows another place than the page tells, the page offers the chapter told there
  and the DM opens it with one press. Only in an assembled book, whose chapters are the campaign's
  places; a written story keeps its order.
- The card of someone of an assembled book has no "By the book": that book holds only the
  world's own description, which the card shows just below.

In the journeys' and the audit's servers the Russian adventure opens its written book (they show
books that wait for reading), so this was looked at and is tested on the English copy; the
Russian words are in the list below.

## New phrases of the interface (the session's, for the owner to read)

«Рассказ: где сейчас отряд» (a screen reader's label), «В книгу», «Действия мастера» (a label),
«Привал», «На экран», «Выдать», «На этой странице броска нет.», «Попросить свою
проверку», «Для этого места и главы готового боя нет.», «Все бои и свой бой», «Рассвет,
прерванный отдых, опасности пути», «Всё, что показывает экран стола», «В этой главе материалов
нет.», «Написать свой материал», «По книге»; for a campaign with no written book: «У этой
страницы нет текста: расскажите сцену своими словами.», «Кто здесь по книге», «Что здесь
можно найти», «На сцене другое место. В книге о нём глава {number}: «{title}».», «Открыть эту
главу»; on the seals: «Готово для этой страницы: {count}» (a screen reader's words for a seal's
tag), «На экране стола появится картинка этого места.». Every other word on the spread is the
campaign's or was in the product.

## Files

New: `apps/web/src/book/work-spread.tsx`, `work-story.tsx`, `work-brief.tsx`, `work-seals.tsx`,
`told.ts`, `styles/work-spread.css` (the two pages), `styles/work-seals.css` (the seals, their
slips, the card's telling), `tests/e2e/working-spread.spec.ts`. Changed: `book/cards.tsx`
(`PersonBody`), `book/page-text.tsx` (the shown screen's number), `dm/dm-sheets.tsx` (the mount,
the held book), `world/entity-details.tsx` (the DM's card order), `styles/book-body.css` (the
bookmarks keep their width when a card opens on the spread), `i18n/ru-book.ts`, `main.tsx`,
`apps/server/src/testing/ui-ru-campaigns.ts` and `tests/e2e/fixtures/investigation-campaigns.json`
(the journey's campaigns), `playwright.config.ts` (the journey joins the iPad project).

## Verification

| Check                                                          | Result         |
| -------------------------------------------------------------- | -------------- |
| `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check` | pass           |
| `pnpm run context-budget`                                      | pass           |
| `pnpm run test` (unit)                                         | 5,127 of 5,127 |
| `working-spread.spec.ts`, `dm-book-library.spec.ts` (Chromium) | 4 of 4         |
| Chromium journeys, every one but `party-known` and the voice   | 388 of 388     |
| The iPad project (WebKit), every journey but `party-known`     | 29 of 29       |

After the last whole run only words changed (seven Russian phrases and one English key, after a
copy review); the checks of the first three rows and the journeys that read those words —
`working-spread`, `dm-book-library`, `dm-book`, `language-ru` — were run again: 11 of 11.

The whole runs before the last one found this stage's own faults, all fixed: the working story
named a second article "Текст" (two journeys of the Book read one by that name; it is a plain
block now); under an open page the story and the seals stayed in the keyboard's order (a
journey's Tab ran out of presses; under a page they are `inert` now); a name in the brief of a
page with no words was a second button with the name of that person's plate (three journeys met
two buttons of one name; the name is a word now); and a result laid at the foot of an open card
covered the card's own buttons (the long journey from the sign-in to the ending could not press
"Full character sheet"; a result lies at the plate's head and the card begins under it, and the
working spread's journey checks that).

Looked at by eye on the lighthouse's book: the spread at 1440×900 and 1024×768 with nothing
chosen, with a person's card, with each of the five slips, with a result over an open card, after
a turned page and a turn back; on the English adventure, a page with no words and the offer of
another chapter. The measurable
layout audit (`ui-layout-audit`) on the spread at 1440×900, 1280×720 and 1024×768 — plain, with a
card, with a slip, on a page with no words, with the offer: no finding of this stage (it reports a
paragraph scrolled out of the card as lying under the dice, which the card's own scroll hides).

Found by eye and fixed: a name of three words was cut on its small plate (the name's type is set
for the plate now; a journey checks that none is cut); a card on the tablet showed one fact of
the book in a 290 px plate (a close head, facts in one run: three in view); the picture showed
through the card's fading edge (the plate is hidden under an open card); choosing someone on a
1280-wide screen narrowed the bookmarks and set the page's words again (they keep their width on
the spread).

In a screen reader's order the place and who is here come before the story and the seals (the
world's Scene is earlier in the page than the DM's tools): the order is whole, not the visual one.

Not run: the `webkit` project (the release journeys in desktop Safari's engine; CI runs it),
`party-known`, `voice.spec.ts` (WebRTC does not connect on this machine today, on `main` either),
the native shells, a real tablet. Not seen: the Russian words of a page with no words on a
screen (see above).

## Left

- The spread needs 1024×600; an upright tablet and a phone keep the Scene and the Book apart.
- A fight is still run from two tabs (the next proposal).
- The seals and the initial are the stylesheet's; painted ones per campaign are the "new book
  materials" proposal.
- The Book's own right page still lists a page's moments under a scroll: with the seals on the
  Scene it is the place for reading ahead, as the owner chose.
- The owner's own campaigns run on a book assembled from the world until the written books of
  the two built-in adventures are read and opened (his reading, ADR 0074 §2.8).
- A card on the tablet is still a plate tall: a long card scrolls inside it.
