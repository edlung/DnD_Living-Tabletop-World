# The DM's book: the plan (Stages 900–950)

Owner request 2026-11-22, typed in a working session: a book as the DM's screen — the story on the
left page with links to game moments, the picture and "how we play this" on the right, the other
categories behind bookmarks, the book's look taken from the campaign's illustrations. The session
built a demo over the day; the owner accepted it («Да, развиваем»), corrected the first plan («мне
для всех компаний книжный формат нужен … 55 кампаний») and opened the work («Да, открываем»).
Record with every quoted word and his four choices: `reviews/OWNER_DM_BOOK_2026-11-22.json`.

**Authorized: Stages 900–930, for all 55 campaigns, without stops between them, each on its own
branch and pull request; a report to the owner at the end of 930.** Stages 940 and 950 are in this
plan so that the whole road is visible; neither is authorized. Merging, deployment, the family
playtest and real devices stay the owner's. ADR 0074 holds the contracts, one section a stage, each
added by its stage.

Status: **Stages 900–930 are implemented** and wait for the owner (`reports/STAGE_900_COMPLETION.md`
… `reports/STAGE_930_COMPLETION.md`, ADR 0074 §1–§4); the report to him is the last of them. Five
stacked pull requests, none merged. Stages 940 and 950 are not authorized.

The sample for the screen is the demo of this session: `docs/design/dm-book-sample/` and the
owner's private page named in the record. A second concept, made the same day in another session on
the Bells of Hollowmere, is kept in `docs/design/dm-book/`; what is taken from it is listed under
Stage 900.

## When it is done (the owner's checklist for Stages 900–930)

1. **Any of the 55 campaigns opens as a book** on the DM's screen: the chapter's words to read
   aloud, then its scenes page by page.
2. **A name in the text is a link.** Pressing it opens, on the right page, who this is, what they
   want, how they speak, what they know. The scene's other moments — the roll, the fight, the
   clue, the handout, the puzzle, what the players may choose — are listed on the right page.
3. **The picture on the right** is the most exact one the campaign has: the moment's, else the
   place's, else the chapter's; the caption says which.
4. **Bookmarks** above the book open what the dock holds today: heroes, people, places, what the
   party knows, handouts, rules, the journal.
5. **The path through the chapters** says which chapters are played, which the party can reach
   now and why, and which wait; a ribbon marks where the party is; reading ahead moves neither
   the ribbon nor the table's screen.
6. **A moment is played from its card**: the roll is asked of the hero, the clue becomes the
   party's, the handout is given, the fight starts — each through the command the product already
   has.
7. **A meeting** starts, pauses and ends from the book, with "Previously…" as it is today.
8. **The book looks like its campaign**: the texture, accent and lettering of that campaign's
   materials.
9. **The dock is still there.** Nothing the DM can do today is taken away.

## Two layers

- **Layer 1 — the book from what a campaign already has.** No model writes anything and the owner
  reads nothing new. Read in the sources on 2026-11-22: all 1,323 scenes of the 53 authored
  campaigns have their text, their choices, a check line and what follows a failure; all 434
  chapters have words to read aloud; 430 chapters name clues; an NPC of the cast is named in the
  text of 1,177 scenes. Stages 910–930 are this layer.
- **Layer 2 — enrichment, campaign by campaign.** Narration written to be read aloud where a
  campaign's scene text speaks to the DM (about 38 of the 53, by a rough measure: direct speech a
  scene), links inside the line for moments other than people, words for outcomes, missing
  endings, pictures of scenes and events, the book's own materials. It needs paid text, generated
  pictures and the owner's reading. Stage 950; not authorized.

## Where it stands (read in code and data, 2026-11-22)

| Area                  | There today                                                                                                                                                                                                                           | Missing for the book                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Campaign text         | `source/act-N.json` or `sessions-N.json` hold every chapter and scene; the package keeps goal + read-aloud as a situation's description, choices as approaches, the first chapter as `firstSession` (`scripts/lighthouse/package.ts`) | Scene text reaches the package only in the collections (as situations); the check line, puzzles and handouts never do |
| The DM's screen       | The dock (`apps/web/src/shell/dock.tsx`): nine sheets for everyone, ten for the DM; none shows campaign text                                                                                                                          | A screen that shows the story                                                                                         |
| Rolls                 | `POST …/check-requests`, a hidden DC, group checks (`packages/contracts/src/dice/rolls.ts`)                                                                                                                                           | A prepared check tied to a scene                                                                                      |
| Fights                | Prepared encounters start in one step through the World Engine (`apps/server/src/combat/prepared-encounters.ts`); the battle map is cast to the table's screen                                                                        | Starting one from the page; the turn shown on the page                                                                |
| Clues                 | `AddClue`, `SetDisclosure`; "What we know" in the Chronicle                                                                                                                                                                           | The link from the text to those commands                                                                              |
| Handouts              | The DM's kept handouts and giving (`apps/server/src/handouts/`, `library/`)                                                                                                                                                           | A campaign's handouts are not imported; the display has no handout cast                                               |
| The table's screen    | Casts: scene, battlefield, picture, story, title and others (`packages/contracts/src/display/display.ts`)                                                                                                                             | "The screen follows the ribbon, not the reading"                                                                      |
| A meeting             | Start with "Previously…", pause, end, the break timer, the next game, the table's agreement (Stages 710–799)                                                                                                                          | Nothing new: the book calls what exists                                                                               |
| The order of chapters | World maps and routes; notes "if the party changed the plan" (`source/table-guide.json`, `table-routes.json`)                                                                                                                         | What a chapter needs to be entered is one sentence in `world.order`, not data                                         |
| The look              | A catalogue of 55 campaign materials: texture, accent, lettering (`apps/web/src/visual/campaign-themes/`)                                                                                                                             | The book's own materials and the icons of link kinds (Layer 2)                                                        |
| Pictures              | Places, portraits, items, battle maps                                                                                                                                                                                                 | Pictures of scenes and events (Layer 2)                                                                               |

The two built-in adventures keep their worlds as seeds in `fixtures/` and their DM text in
`docs/BUILTIN_ADVENTURES_DM_RU.md`; they have no scene text as data.

## Stages

### 900 — Foundation (docs only)

The record, this plan, ADR 0074 §1 (what the book is), the four work orders, the sample's sources
in the repository. Before it, on its own branch and pull request: the editorial work of
2026-11-22 as the other session left it, with the project's checks run on it (the owner's first
choice in the record).

Taken from the other concept (`docs/design/dm-book/`, read in its `reader.js`, `reference.js` and
work order): Hollowmere's eight spreads as the pages of that adventure (Stage 910); returning
focus to the line a card was opened from; a switch for the size of the text; the picture enlarged
in a dialog; a page's notes; announcements for a screen reader when a card opens; working with
storage switched off; reading with the keyboard. The sample keeps what that concept does not
have: the path through the chapters, the ribbon, the meeting, the fight on the page, the brief of
a page with its moments, three bindings.

### 910 — The book's data

Every campaign gets its book as a document beside its packages (ADR 0074 §2):
`fixtures/campaign-library/<id>/book.json`, built by the library's build from the campaign's
`source/` — chapters, their pages from the scenes as written, the check line also as fields where
it can be read with certainty, puzzles, handouts, the cast and the clues as the DM reads them, the
campaign's notes on a changed plan, links to people found by their names in the text, the
encounters tied to a chapter. The two built-in adventures get books under the same contract:
Hollowmere's from the other concept, Ravenford's written by the session; both stay closed until
the owner has read them. Tests compare every page with its source and every key with every
variant's package.

Changed while the stage was done: the plan first said "the package gains an optional `book`". A
package may be 512 KB at most and the largest is 453 KB; a book is up to 252 KB and would repeat in
each of a campaign's four to seven packages. The book is its own document; packages, their digests
and the series' builds are untouched.

### 920 — The book to read

The DM's screen for any campaign that has a book: the spread, the brief of a page, cards that
explain a moment, bookmarks that open today's sheets, the path through the chapters with the
campaign's map, the ribbon, the look from the campaign's materials, pages that turn instead of
scrolling. It changes nothing in the world; the dock stays.

### 930 — Play from the book

Cards act through commands that exist: ask for the check, give the clue to the party, give the
handout, start the prepared encounter and show its turns, cast to the table's screen, start, pause
and end the meeting. A free roll for what the text did not foresee. The journal of the book is
the campaign's own history. Checked on the iPad shell.

### 940 — A trial at a real table (not authorized)

One real meeting by the book, on a tablet and a TV. The owner's list of corrections.

### 950 — Enrichment (not authorized)

Layer 2, in batches of four or five campaigns, the lighthouse first: two of its chapters are
written already (`docs/design/dm-book-sample/`). Measured in the demo: two chapters gave 40 and
24 fragments of text for $0.14 and $0.11; 37 pictures were drawn in 13 minutes in six streams.
Estimated for all 53: about 13,900 fragments, about 85 hours of the owner's reading at an assumed
20 seconds a fragment, about $47 of text, about 1,700 pictures of scenes and events.

## Decisions

(O) the owner's, with the date; (S) the session's, his to overrule.

1. (O, 2026-11-22) The book is the base of the DM's screen.
2. (O, 2026-11-22) The book is for all 55 campaigns at once, not for one first.
3. (O, 2026-11-22) The editorial work of 2026-11-22 is committed by this session as it is, on its
   own branch and pull request.
4. (O, 2026-11-22) The sample is this session's demo.
5. (O, 2026-11-22) Both built-in adventures get a book; the owner reads Ravenford's new pages
   before they are switched on.
6. (O, 2026-11-22) Stages 900–930 run without stops; a report at the end.
7. (O, 2026-11-20) No rails: the book asks what the players chose; it never chooses.
8. (O, 2026-11-21) Every model-written phrase is read by the owner before it reaches a table.
9. (S) The book lives beside the dock until the trial at the table; replacing the dock is a
   later decision.
10. (S) The book's look comes from the existing catalogue of campaign materials in Stages
    920–930; its own generated materials wait for Stage 950.
11. (S) A book unit is a chapter («глава»); an evening of play is a meeting («встреча»). The
    campaigns call their chapters evenings; the book does not rename their text.
12. (S) Where a campaign's scene text speaks to the DM, the book shows it as it is and says so;
    it does not pretend the text is for reading aloud.
13. (S) A gap in a campaign's data (a person without a card, a letter without text, a condition
    without a list) is shown to the DM as a gap, not filled.
14. (S) The ribbon, the open bookmark and the DM's notes on a page are the DM's own state beside
    the world, not world state; the journal of the book is read from the campaign's history.
15. (S, Stage 910) A campaign's book is a document beside its packages, not a field of the
    package (ADR 0074 §2.1); both built-in books, Hollowmere's too, wait for the owner's reading.
16. (S, Stage 930) The table's screen is cast only on the DM's press, never by a turned page; a
    clue is not handed to the party from the book and a fork is not marked, because the product
    has no command for either and none is added (ADR 0074 §4.5, §4.7).

## Boundaries

The World Engine alone changes the world. Prepared situations, encounters, checks and choices are
plans, never player decisions (`packages/contracts/src/campaign/AGENTS.md`). The book's text is
the DM's; a player and the table's screen receive only what the DM sends, and a roll a player sees
carries no DC. No AI is called from the book. No paid provider call and no generated picture in
Stages 900–930. A package and a book are generated from their source, never edited by hand. Nothing
is merged or deployed by the session.
