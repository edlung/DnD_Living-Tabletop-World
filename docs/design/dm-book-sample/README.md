# The DM's book: the accepted sample (2026-11-22)

The clickable demo the owner accepted as the base of the DM's screen
(`reviews/OWNER_DM_BOOK_2026-11-22.json`, `docs/DM_BOOK_PLAN.md`). It is a sample to look at and
to read, not code to continue: Stage 920 builds the screen in `apps/web/src/book/` from the
product's own parts.

- The page: https://claude.ai/artifact/7KFsPxmd7rGB8AjP8XFqE6 — the owner's private page.
- `dm-book-sample-2026-11-22.zip` — its sources as published (version 5). An archive on purpose:
  the demo's engine is one 747-line script written for a demo, over this repository's file-size
  policy, and nobody should maintain it.
- `spread.png`, `route.png`, `gathering.png`, `fight.png` — four states at 1180×820.

## What is in the archive

| File                                                             | What it is                                                                                                                                           |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`                                                     | The shell and every style: three bindings (`data-skin` lh, rc, mc), the spread, cards, the fight, the path, the cover                                |
| `engine.js`                                                      | One engine for the three books: state a book, render of the spread, cards by kind, the fight, the route, the meeting                                 |
| `books.js`, `books-route.js`                                     | The three books' pages and links, cut from the campaigns' data; chapter 2 of the lighthouse and the rules of its free route                          |
| `lh-text.js`, `lh-text2.js`                                      | Narration and lines Sonnet 5.5 wrote for chapters 1 and 2 of the lighthouse from the campaign's data (not read by the owner)                         |
| `lh-text3.js`, `lh-text4.js`                                     | Words for stopping early, for an absent hero and for the keepers' fight, written on 2026-11-21 for the earlier table concept (not read by the owner) |
| `tools/extract.py`, `tools/process-img.mjs`                      | How `data.js` and `img/` were built from `campaigns/` and the art originals; neither output is in the archive                                        |
| `tools/book-text.ts`, `tools/book-text2.ts`, `book-ledger.jsonl` | The two text jobs as run through `scripts/campaign-shared/sonnet-author.ts`, and what they cost ($0.36, one run truncated)                           |
| `tools/audit.mjs`, `tools/shot.mjs`, `tools/stress.mjs`          | The states the layout audit walked, the screenshot helper, random fights                                                                             |

Pictures made for the demo (six events of the lighthouse's first chapter, icons of link kinds and
book materials for three campaigns, 37 in all) are with the other art originals, outside the
repository: `~/Documents/living-tabletop-world-art/dm-book-2026-11-22/`.

## What to take from it

- The spread: the story on the left with links in the line; on the right the picture, its
  caption (chapter › place › moment) and either the brief of the page or the card of one moment,
  with the card's actions fixed at its foot.
- Eight kinds of moment: dialogue, roll, fight, puzzle, find, handout, fork, end of chapter.
- The path through the chapters: played, reachable now and why (clues that name the place,
  routes from places the party has been), address not found, later; the ribbon; reading ahead.
- The meeting: the closed book, the endpaper "gathering at the table", the clock and the pace
  hint from the scenes' minutes, the break, closing the book.
- A fight on the page: "with what" from the hero's sheet, "at whom" in one press, the result on
  top, peaceful ways in view, the turning point, the battle map as a second face of the picture.
- A campaign's binding from its materials.

## What is a demo's shortcut and must not be carried over

- Its own dice, attack and damage arithmetic, death saves and spell slots: the product's rules
  and the World Engine do this (ADR 0074 §1.1).
- State kept in the page and lost on reload; one script that redraws everything.
- "Play the whole chapter (demo)", "+30 minutes (demo)": controls that exist to show a change.
- The rule "two heroes at the table face one keeper": the demo's, not the campaign's.
- Pages that scroll when the text is long: the product divides a page (Stage 920).
- Model-written narration and lines: Layer 2, read by the owner first (Stage 950).

## What the demo found in the campaigns' data

A chapter's ending written for one route only; a condition ("coordinates from any two sources")
with one matching clue; a letter with no text; a ferry with no words; people in a scene without a
card (the baker, the gravedigger); world-map pins on a schematic grid, not on the painted
islands. The book shows such gaps to the DM (ADR 0074 §1.6); they are material for Stage 950.
