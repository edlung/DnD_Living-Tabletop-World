# What the browser still drew in a form — report (2026-11-25)

Work order `work-orders/BOOK_FORMS_DRAWN_2026-11-25.md`; ADR 0075 §28; the owner's words
`reviews/OWNER_BOOK_LOOSE_ENDS_2026-11-25.json`. Branch `claude/book-forms-drawn`, stacked on
`claude/book-on-paper` (pull request 109). Status: **implemented; nothing is merged or
deployed.**

## What changed on the screen

| Before                                                                           | Now                                                                                        |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| A select opened the system's own list (white or grey, the system's tick)         | A slip of the book's paper: inked options, the chosen one in the rubric's red              |
| «Вид» behind the cover's clasp: a field with a drawn triangle, the system's list | The drawn mark of a list, and the same slip of paper                                       |
| A date and time's field carried the system's calendar mark                       | The page's clock in the rubric's red                                                       |
| A page's scroll bar: the system's grey trough                                    | A thin stroke of the page's ink                                                            |
| «Войти», «Продолжить», «Начать» before any book: pale teal buttons; plain fields | A page's stamped labels, the main action in the rubric's red; ledger fields; the same list |

## What stays the browser's

- **Safari on a tablet or a phone opens its own picker** for a list: it cannot be set by a page.
  The closed field is drawn the same there.
- **A date's and a time's own pop-up** and the order of day and month in the field are the
  reader's system's.
- **Lists that stay lists**: every select of the world's own names (a creature, a spell, a place,
  a check), and those of a few fixed options not yet turned into tiles — a campaign's five
  options, how long a link lasts, a saving throw, what to create, how a chat line is said. Each
  opens as a slip of paper now. Turning them into tiles or faces changes a form's controls and
  the journeys that fill them; it is named here, not done.

## New phrases of the interface

None.

## Files

New: `apps/web/src/styles/book-lists.css`. Changed: `styles/book-slips.css` (the front's paper
takes a page's controls), `main.tsx` (the stylesheet). A tile's words
(`styles/book-picks.css`) were set with the commit of pull request 109.

## Verification

- **Static**: format, lint, typecheck, the context budget.
- **Unit**: 5,139 of 5,139.
- **Journeys** (Chromium and the iPad project): those that choose from lists — accessibility, a
  campaign's options, perspectives and their choices, the DM's tools, traps, travel, chat, the
  next game, editors, a hero's builder, the guide, comforts, dice, encounters, the bestiary, a
  session's lifecycle — 64 of 73 at first: nine failed on a phrase. The journeys of knowledge
  isolation read the page's whole text for traces of the DM's secrets; a stylesheet's words reach
  that text in development, and two comments of the new stylesheet said "mark of" — the start of
  a secret's name in the test world. Reworded; those ten journeys pass. Then the way in and the
  shelf — signing in, accounts, the hub's library, the campaign's book and end on the hub,
  privacy, about, a moved campaign, keepsakes — 49 of 49.
- **Looked at, with the layout audit**: an opened list on the Settings page, the list of views
  behind the clasp, the date's field, the way in, the shelf, a library book's look.
- **Not verified**: Safari's own picker on a real tablet; a system set to Russian (the date's
  field writes its order by the system's locale). The whole suite runs in the pull request's
  checks.
