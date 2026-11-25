# Closer to the concept, forms drawn — report (2026-11-25)

Work order `work-orders/BOOK_CLOSER_TO_CONCEPT_2026-11-25.md`; ADR 0075 §25; the owner's words
`reviews/OWNER_BOOK_CLOSER_TO_CONCEPT_2026-11-25.json`. Branch `claude/book-closer-to-concept`,
stacked on `claude/book-full-screen` (pull request 106). Status: **implemented; nothing is merged
or deployed.**

## Why

After the whole-screen book the owner asked: «а можно еще ближе к концепту? стандартные формы
можно заменить сгенерированными значками где только можно?». Putting the concept beside the
running product at the width of his own window (766 × 799) showed what §24 had left: there the
Scene was not a spread of the book at all — two pages began at 1024 px, and below that it was the
place's picture under dark glass plates. And no width set a page as the concept sets it.

## What changed on the screen

| Before                                                                          | Now                                                                                                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Under 1024 px the Scene was a picture with dark plates over it                  | A spread of two pages from 701 px: the story on the left, the place on the right                                               |
| The campaign's name over the left page; the place's name under the picture      | A running head on each page: the book and the chapter; the place, the day and the hour                                         |
| The story's title at the left, a button beside it, a small ornament             | The title alone in the page's middle over the book's own ornament (a hairline where a book has none)                           |
| Who is here: rows of plates with a small picture and a name                     | Round portraits, a name under each; a figure stands inside its ring                                                            |
| A short ribbon at the head of the gutter (a red band with a thin stripe)        | The book's own ribbon down the whole gutter, the chapter's number at its head                                                  |
| "‹" and a red "Дальше ›" button; "Начало главы · 3 стр."                        | The ornament, the leaf's number, and the engraved pointing hand on each side, the page's own word beside the one that turns on |
| The dice across both pages under the spread                                     | From 1024 px the dice are the right page's foot; the story's page runs to the foot of the book                                 |
| The Book's story page set differently from the Scene's                          | One print for the story's leaf in both                                                                                         |
| Radio buttons: where you play, the tone, how to roll, what the screens show     | Tiles: a vignette and its word; the chosen one framed in the rubric's red                                                      |
| Lists: the weather, who is surprised                                            | The same tiles                                                                                                                 |
| Lists of the heroes' names: whom a check is asked of, whom a handout is for     | The heroes' portraits; "everyone" a drawn tile before them                                                                     |
| An inked square, an inked ring, two triangles for a list, a triangle for a fold | The quill's box and its red tick, the ring and its drop of wax, a leaf for a list and for a fold — pictures                    |
| Glyphs on a rest's buttons, a hero's card, "More dice"; a thin cross to close   | Vignettes of the same set; a cross of two quill strokes closes a page, a card and a slip                                       |

## Pictures by Codex CLI

Fifty-six vignettes in one style — a pen engraving in sepia ink tinted with madder red and old
gold, on a transparent ground — so one set sits on any book's paper. The first (the table with
its stools) was drawn alone and was the style reference of the others; none failed. A fifty-seventh, a
closed book for "Close", was drawn and is not used (it read as "the Book"). They are
pieces of the product's own set (`final/ltw/pick-*.png`). Originals, prompts and the generator:
`~/Documents/living-tabletop-world-art/book-picks-2026-11-25/`. Four are published under their
options' own names (`tone-cosy`, `tone-adventurous`, `tone-spooky`, `hp-healing`).

The build draws nothing and learned three things: `pick-*` pieces (each a custom property
`--pick-<name>`; an element names its picture with `data-pick`), and two pieces trimmed to their
paint — `ribbon-band` (55 books) and `flourish` (the 3 books with a divider), the second with its
size beside it so a page needs no flag to choose between the ornament and the hairline.

## Found on the way

- **The owner's window was never a spread.** Every earlier look at 766 px was of pages other
  than the Scene, or of the fight; the Scene itself kept the pre-book layout there.
- **The story's words ran under the dice at 766 px** once the spread began there: the Book's own
  rule for a narrow screen (one scrolling column) reached the spread's story. The spread's story
  stays a page of a height, its words in screens that turn.
- **A name under a portrait broke inside a word** («Смотрите-ль») in a cell 64 px wide: the cells
  are as wide as the longest common word at their size, and a word is broken only when it cannot
  fit at all.
- **The generated stylesheet reached the 700-line cap** with the drawn choices: it is written
  under `generated/` now, as generated output is everywhere else in the repository.
- **The layout audit's rule for rows of a list read a form's section as a row** once its tiles
  filled the width: the rule keeps to rows no taller than 140 px (the skill's `audit.mjs` and
  `SKILL.md`, outside the repository).

## New phrases of the interface

None. The tiles carry the words the options had; the legends are the labels the lists had; a
page's number is a number. One phrase is no longer shown: «Выберите погоду» (the list's empty
line — no tile is chosen until the DM chooses one).

## Files

New: `apps/web/src/styles/book-concept.css`, `book-leaf.css`, `book-picks.css`;
`apps/web/src/book-kit/pick.tsx`, `hero-tiles.tsx`; `tests/e2e/support/choices.ts`; 114 pictures
under `apps/web/public/book-materials/` (56 `pick-*`, 55 `ribbon-band`, 3 `flourish`).
Changed: `world/scene-spread.ts` (701 px), `world/scene.tsx` (the plate's slot),
`world/scene-objects.tsx` (round portraits on a spread), `book/work-spread.tsx` (the plate's
place measured), `book/work-story.tsx` and `book/book-sheet.tsx` (the leaf's head and foot),
`shell/sheet.tsx`, `dice/book-foot.tsx`, `dice/check-forms.tsx`, `dm/session-sheet.tsx`,
`dm/cast-form.tsx`, `dm/hand-forms.tsx`, `dm/world-controls.tsx`, `dm/party-card.tsx`,
`combat/surprise-choice.tsx`, `rest/dm-rest-controls.tsx`, `ritual/agreement-tool.tsx`,
`handouts/handouts.tsx`, `travel/travel-form.tsx`; `styles/work-spread.css`,
`scene-spread.css`, `book-controls.css`, `book-kit.css`; `scripts/book-materials/build.ts`;
the generated `manifest.json` and `generated/book-materials.css`; journeys that choose from the
tiles.

## The UX pass

Done by the session from the running product and its pictures (the Design plugin's critique,
accessibility review and copy review; the walkthrough of a DM's tasks), with what each found.

**A DM's tasks on the spread at 766 × 799.** Read the passage aloud: the title, whose words these
are and the words stand in reading order on the left page; the page turns with the hand at its
foot, which says what the turn does («Дальше», «Следующая страница», «Следующая глава»). See who
is here: a portrait and a name each, on the right page under the picture. Look closer at someone:
a press, and their card takes the picture's place — who is here keeps to two rows beside it and
the one chosen stays in view. Call a rest, start the prepared fight, show the place on the
screen, hand a handout: the five seals under the portraits, each with its word. Begin the
evening: the page's first line between sessions. Roll a die: the page's foot. None of these needs
a second screen or a scroll.

**Found and fixed in this pass.**

- The order a key walks the right page was not the order it is read in (the table's faces stood
  on the rule above the seals, after who is here, but came first for a key): the faces stand
  under the plate, where they come for a key too.
- A card of someone chosen had some 200 px at 766 px once the spread began there: with a card
  open who is here keeps to two rows and scrolls, the chosen one in view.
- The Book's page in a narrow window had a dark frame of the old binding inside the book: it is
  the book's paper.
- "Close" drawn as a book shut with its clasp read as "the Book" where the word has no room: a
  cross of two quill strokes closes a page, a card and a slip.
- The table's cards over a spread were stretched down the page between 701 and 767 px (a phone's
  rule met the spread's): their box is said whole.

**Left as it is, said plainly.**

- «В книгу» on the story's page is a mark without a word (its name is read to a screen reader
  and shown to a pointer). The ribbon beside it and the first bookmark do the same with words.
- A tile that is not chosen has no frame: on a touch screen nothing but the chosen neighbour's
  frame says it can be pressed. The legend above the row names the choice.
- One picture — the table with its stools — stands for "at the table", "everyone at the table"
  and "the party".
- A thing with no picture of its own is a dark disc among the portraits, as it was a dark disc on
  its plate.

**Accessibility, beyond what the journeys' scans measure.** A tile's radio button lies over the
whole tile at `opacity: 0`: it keeps its name (the tile's word), its group's legend, the arrow
keys and a focus ring drawn on the tile. A hero's face is such a tile with the portrait
decorative. The vignettes are decorative everywhere (`aria-hidden`); nothing is said by a picture
alone except the two marks named above, which have names. The running heads are text; the
book's name in the left one is drawn by the stylesheet and is the page's level-one heading for a
reader of the screen. Targets: tiles 60 × 70 px and more, the hands 48 × 44, the corner marks
40 × 40. Not checked: a screen reader, a real touch screen.

**Copy.** No new phrase. One is gone: «Выберите погоду».

## Verification

- **Static checks**: formatting, lint, types, the context budget — green.
- **Unit tests**: 5139 of 5139 (two new: a picture in the product's set for every choice and
  action the client draws; a ribbon trimmed to a band and a divider to a flourish for each book
  that has one).
- **Journeys** (Chromium, the iPad's WebKit, the release journeys in WebKit): the whole run,
  420 passed, 7 failed, 6 skipped, 28.5 minutes. The seven all pressed a hero's face: the
  portrait lay over the tile's unseen button, so a person's press chose it but a journey's
  `check()` waited for the button itself. The button lies over the portrait now. Those seven and
  the spread's own journeys were run again on both engines after that and after the table's faces
  moved under the plate: 79 of 79. **The whole run was not repeated after those two corrections**
  (two rules of a stylesheet): CI runs it.
- **Looked at by the session**, with the layout audit (`ui-layout-audit`) run on each: all twenty
  pages of the DM's book at 1024 × 768; the Scene at 766 × 799, 1024 × 768 and 1440 × 900, with a
  card chosen and with a seal's slip open; the Session, Party, Encounter, Table screen, Time and
  weather, Dice, Appendix, Places and Book pages at 766 × 799 too; a fight at 766 × 799; a
  player's phone at 390 × 844 and tablet at 766 and 1024 px. The audit is clean on all of them.
  Two of its rules were narrowed where they read something else as a fault (a form's section as a
  row of a list; words under an open page as words under a button on it).
- **Not verified**: a real tablet, phone and TV; a screen reader; the fifty-three books that have
  no ornaments of their own were not opened one by one (their spread differs only in the hairline
  and the product's drawn seals, which the journeys of the built-in adventures run on).

## What is left

- **Fifty-three books have no seals, initial, corner or ornament of their own**: their spread
  shows the product's drawn wax and a hairline. Drawing them waits for the owner's look at the
  three that have them (`docs/BOOK_SECOND_PASS_PLAN.md`).
- **Lists whose options are the world's own names** (a creature, a spell, a place, a check) stay
  lists, with the drawn mark. The hero's builder keeps its own forms.
- **The tabs of a part's pages** stand over the spread; the concept has none.
- **The table's screen, the shelf, the way in, the workshop, the Chronicle's own dialog** are as
  they were.
- **Not checked**: a real tablet, phone and TV; a screen reader.
