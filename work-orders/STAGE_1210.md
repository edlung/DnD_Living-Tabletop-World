# Stage 1210 — new book materials for three campaigns

Authorized by the owner on 2026-11-25: «Реализуй весь план до конца»
(`reviews/OWNER_BOOK_SECOND_PASS_2026-11-25.json`, `docs/BOOK_SECOND_PASS_PLAN.md`). The plan's
words for this step: «Новые материалы книги на пробу для трёх кампаний. Нарисованная рамка с
обрезом, печати действий, буквица, уголки — в стиле каждой кампании, через Codex CLI». ADR 0075
§22. Stacked on `claude/stage-1200-player-phone` (pull request 103). **Three campaigns on trial;
the other fifty wait for the owner's look at these.**

## Why

The working spread's seals are the same drawn red wax in every book, its initial a plain red
letter, and the block of pages a ruled pattern: three places where a book could look like its own
campaign and does not. The owner's rule (2026-11-23): each book in its own style, pictures, pages,
binding and icons in harmony; pictures by Codex CLI.

## The three

«Маяк Между Ветрами» (`lighthouse`, a family tale), «Дождь по страховому случаю» (`rain-check`,
a noir), «Корона из чужих костей» (`marrow-crown`, dark fantasy): the three that already carry a
full set with an emblem, far apart in style.

## Scope

- **Twenty-four pictures by Codex CLI** (OpenAI's image model), each drawn with its campaign's
  own reference pictures and the style words its first set was drawn with: five seals of the
  working spread (a roll, a fight, a rest, the screen, a handout) pressed in one wax a campaign,
  the plate a chapter's initial is printed on, a corner ornament, the painted edge of the block
  of pages. Originals outside the repository:
  `~/Documents/living-tabletop-world-art/book-details-2026-11-25/` (prompts, references, the
  first run's odd seal set aside), copied into the sets' folder
  `book-sets-2026-11-23/final/<theme>/`.
- **The build knows the pieces** (`scripts/book-materials/build.ts`): `seal-<kind>` and `initial`
  are converted as they are; `corner` and `edge` are cut from their originals without changing
  a pixel (the ornament's corner; a band of the fore-edge).
- **The working spread uses them** where the book has them: the seals (`book/work-seals.tsx`),
  the initial's plate and the corner on the story's page (`book/work-story.tsx`,
  `styles/book-details.css`), the painted edge under the page (`styles/book-details.css` over
  `book-body.css`). A book without a piece keeps what the product draws.

Unchanged: every other book's set; what a seal does; the story's words.

## Journeys and tests

- `tests/ui-kit/book-materials.test.ts`: the three books carry the new pieces, each file byte for
  byte as the manifest says; a book without them answers none.
- `tests/e2e/dm-book-library.spec.ts`: on the lighthouse's working spread a seal is the book's
  own picture.

## Known limits

- Fifty-two other books keep the drawn wax and the plain initial until the owner has looked at
  these three.
- The corner stands at one corner of the story's page; the right page is the place's picture.

## Out of scope

Merging and deployment stay the owner's.
