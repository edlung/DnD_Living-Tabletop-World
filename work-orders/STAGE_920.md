# Work Order — Stage 920: the book to read

Authority: the owner's words of 2026-11-22 (`reviews/OWNER_DM_BOOK_2026-11-22.json`), Stages
900–930 without stops; program `docs/DM_BOOK_PLAN.md` (section 920); ADR 0074 §3, written with the
stage. Branch `claude/stage-920-book-to-read`, stacked on Stage 910's. Sample:
`docs/design/dm-book-sample/`.

The DM opens any campaign that has a book and reads it: the story on the left, the picture and
"how we play this" on the right. The stage changes nothing in the world.

**Changed while the stage was done (2026-11-22).** A check and a fork are sections of the page's
brief, always in view, not cards to open (item 3). The map is the Places section, one press from
the path; a map drawn inside the book is left for later (item 6). There is no bookmark "people":
the product has no such section, and a person opens from the text or from the page's moments
(item 5). The book is found for a campaign through the record of its publishing, and — for a
package the library no longer ships as it is — by the campaign's name (ADR 0074 §3.1).

## Deliver

1. **One read for the DM**: the active campaign's book, under the DM's perspective only. A player,
   a display and a stranger get nothing and learn nothing from the refusal.
2. **The spread** (`apps/web/src/book/`): the left page is the chapter's words to read aloud or a
   scene's text, with the people named in it as links; the right page is the picture and, under
   it, the brief of the page — what the scene is for, its moments (the roll, the fight, the
   clues, the handouts, the puzzle, what the players may choose), the DM's note.
3. **Cards** for a moment, read-only in this stage: a person (how they look, what they want, how
   they speak, what they know, the secret folded away), a check (skill, DC or "no roll", what
   follows a failure), a fight (when it starts, who is in it, the peaceful ways the trigger
   names), a clue, a handout, a puzzle with its hints one at a time, a fork.
4. **The picture**: the moment's, else the place's, else the chapter's, from the pictures the
   viewer may already see; the caption says which.
5. **Bookmarks** that open what the dock holds — heroes, people, places, what the party knows,
   handouts, rules, the journal — without leaving the book, and a way back to the same page.
6. **The path through the chapters**: played, reachable now and why, address not found yet,
   later; the campaign's world map with a mark a chapter; a chapter put off or opened by hand.
7. **The ribbon**: where the party is. Turning the next page moves it; opening a page from the
   path does not; "move the ribbon here" does. Kept for the DM beside the world.
8. **Pages that turn**: a page's text is divided to fit the screen; the story does not scroll on
   a tablet in landscape (1024×768 and up). The fork and the way on are always in view.
9. **The look**: the campaign's materials from `apps/web/src/visual/campaign-themes/`; where a
   text speaks to the DM, the page says so.
10. **The way in**: a visible entry to the book in the DM's shell for a campaign that has one;
    the dock stays as it is.

## Session's decisions (each may be overruled)

- All of ADR 0074 §3.
- The ribbon, the open bookmark and the DM's page notes are kept by the server for the DM beside
  the world, so that they follow the DM to another device; nothing of them is world state.
- No cover and no endpaper screen in this stage: the campaign's own start and "Previously…" are
  called from the book in Stage 930.
- The book is not offered on a phone-width screen in this stage beyond what the layout gives for
  free; the DM's device is a tablet or a laptop.

## Boundaries

Reads only: no world command is sent from the book in this stage, and no cast. No AI. No change to
the package contract beyond Stage 910. The text is the DM's: every read is checked against the
DM's perspective on the server, not hidden in the client. Nothing is merged or deployed.

## Checks

- Unit: who may read the book (the DM; not a player, a display, another table's DM); the
  division of a page; the picture's order of choice; which chapters are reachable from clues and
  routes, on the lighthouse's data; the ribbon's rules.
- Journeys (Chromium): open the book of a family campaign, of a collection campaign and of a
  built-in adventure; read two pages; open a person, a check, a fight, a clue; open a bookmark
  and come back to the page; the path; reading ahead leaves the ribbon; a player cannot reach the
  book's read.
- The layout audit at 1440, 1180, 1024, 768 and 390 px, in a light and a dark campaign material;
  the accessibility pass (names, focus, contrast, targets).
- Format, lint, typecheck, the context budget, unit, integration where a store is added, build.
