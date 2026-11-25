# Stage 1210 completion — new book materials for three campaigns

Work order `work-orders/STAGE_1210.md`; ADR 0075 §22; the owner's word
`reviews/OWNER_BOOK_SECOND_PASS_2026-11-25.json`; plan `docs/BOOK_SECOND_PASS_PLAN.md`;
2026-11-25. Branch `claude/stage-1210-book-details`, stacked on
`claude/stage-1200-player-phone` (pull request 103). Status: **implemented for three campaigns on
trial; nothing is merged or deployed; the other books wait for the owner's look at these.**

## What the three books gained

| On the DM's working spread | Every other book                    | «Маяк Между Ветрами»           | «Дождь по страховому случаю»       | «Корона из чужих костей» |
| -------------------------- | ----------------------------------- | ------------------------------ | ---------------------------------- | ------------------------ |
| The five seals             | The same drawn red wax with a glyph | Sea-teal wax, its own emblems  | Cold dark teal, crossed batons     | Marrow-red wax           |
| The story's initial        | A plain red letter                  | On a plate of lanterns         | On wrought iron with a street lamp | On bone and thorn        |
| The page's corner          | None                                | A fine flourish with a lantern | An iron bracket                    | A thorn                  |
| The block of pages         | A ruled pattern                     | Its painted edge               | Its painted edge                   | Its painted edge         |

Twenty-four pictures by Codex CLI (OpenAI's image model), each drawn with its campaign's own
reference pictures and the style words of its first set. One seal of the first run came out red
among four teal ones; the wax's colour is now named for each campaign and that seal was redrawn
(the first one is kept beside the originals, `first-run/`).

A seal does what it did: the picture stands where the drawn wax stood, under it the same word,
on its shoulder the same count. A book without these pieces keeps what the product draws.

## New phrases of the interface

None.

## Files

New: `apps/web/public/book-materials/{lighthouse,rain-check,marrow-crown}/` — `seal-roll`,
`seal-fight`, `seal-rest`, `seal-screen`, `seal-give`, `initial`, `corner`, `edge` (`.webp`, 8 to
32 KB each); `apps/web/src/styles/book-details.css`. Changed: `scripts/book-materials/build.ts`
(the pieces; the corner and the edge as cuts), the generated `manifest.json` and
`book-materials.css` (only these three books' entries), `book-kit/materials.ts` (`BOOK_SEALS`,
`sealPicture`), `book/work-seals.tsx`, `book/work-story.tsx`, `main.tsx`,
`visual/book-materials/AGENTS.md`; `tests/ui-kit/book-materials.test.ts`,
`tests/e2e/dm-book-library.spec.ts`. The build was run on the whole originals folder: no other
book's file changed.

Originals, outside the repository: `~/Documents/living-tabletop-world-art/book-details-2026-11-25/`
(`make_prompts.py`, `gen.py`, `prompts.json`, `refs/`, `out/`, `first-run/`,
`contact-sheet.jpg`), copied into `book-sets-2026-11-23/final/<theme>/`.

## Verification

| Check                                                          | Result                               |
| -------------------------------------------------------------- | ------------------------------------ |
| `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check` | pass                                 |
| `pnpm run context-budget`                                      | pass                                 |
| `pnpm run test` (unit)                                         | 5,137 of 5,137                       |
| Chromium, every journey but `party-known` and the voice        | 394 of 394                           |
| The iPad project (WebKit)                                      | 31 of 31 (six skip themselves there) |

One run, 425 of 425 in 22 minutes, nothing retried. It is also the whole-suite run Stage 1200
left to this stage: its last change (the hero's plate mounted on a phone only) is under it.
`tests/ui-kit/book-materials.test.ts` holds two new tests (each of the three books has its five
seals, its initial, corner and edge, named by its theme's custom properties; a book without them
is given none), and its older test checks every published piece byte for byte;
`dm-book-library.spec.ts` reads a seal's picture, the absence of the drawn wax and the story's
two marks.

Looked at by eye on the audit's own servers: the working spread of each of the three campaigns at
1024 × 768, one of them at 1440 × 900 with a seal's slip open and a seal in focus. The layout
audit (`ui-layout-audit`) of the spread at both sizes is clean. Found and fixed while looking: a
corner drawn over the evening's note (now small, in the page's margins, under the words); an
initial's plate hanging under a one-line paragraph (the paragraph now holds it).

Not run: `party-known`, `voice.spec.ts`, the `webkit` project of the release journeys, the native
shells, a real tablet.

## Left

- Fifty library books, the two built-in adventures and the product's own set keep the drawn wax,
  the plain initial and the ruled block: drawing them waits for the owner's look at these three.
- The corner stands at one corner of the story's page only; the Book's own reading spread and
  the hero's sheet do not use the new pieces yet.
- The painted edge shows as a band nine pixels high under the page: it is felt more than seen.
