# Stage 1050 completion — the Scene and the Story

Work order `work-orders/STAGE_1050.md`; program `docs/BOOK_INTERFACE_PLAN.md`; ADR 0075 §5;
2026-11-23. Status: **implemented; not merged, not deployed**. Branch
`claude/stage-1050-scene-story`, stacked on Stage 1040's.

## What changed

- **The Scene is a spread** in both books on a screen at least 1024 px wide and 600 px tall
  (`world/scene-spread.ts`, `styles/scene-spread.css`). The left page, on the book's paper, is the
  place as it is now in reading order: its name and hour, the talk while it lasts, who sits at the
  table, who and what is here as a list with their pictures, the ways beyond. The right page is the
  place's plate and, under it, the card of what is chosen (the detail panel on paper); with nothing
  chosen the page says where a card comes from. A result is a slip at the foot of the right page;
  the quiet row and the table's cards stand over the head of the spread. A talk takes the plate's
  place at the head of the right page while it lasts, the card of the one it is with under it,
  and no longer closes the card. In a fight seen from the Scene, whose turn it is and the switch
  to the battlefield stand in a strip at the head of the left page. Narrower, and during a fight, the Scene stays as Stage 1040 left it.
- **The ribbon and the Scene point at each other** (`book/scene-ribbon.tsx`): the DM's ribbon hangs
  at the spine of the Scene's spread with its chapter's number and opens the story there; the place
  a page of the story plays at is a link that opens that place's card in the Scene.
- **Every campaign has a book** (`apps/server/src/book/assembled-book.ts`): where none was written,
  the server assembles one — from a published campaign's package (a chapter a situation at one of
  its places) or from a world with no package (a built-in adventure: a chapter a place, the party's
  own first, with who is there and the clues that lie there). Every phrase is the campaign's own;
  only its opening is marked to be read aloud (a situation's words are the DM's and may hold what
  the party has not learned); what it does not hold stays a gap. The written book comes first; a
  built-in adventure's written book that waits for the owner's reading stays closed and the
  assembled one opens instead. The book's pages say «Собрано из самой кампании». The contract gains
  `assembled`; `GET /campaigns/:id/dm/book` gains its second source (plan decision 12). No command,
  rule or projection changed.

## Found and fixed while checking

- On paper, words written straight on a page took the dark theme's light colour from the body:
  the paper scope of the tokens now gives its own ink (`styles/tokens.css`), for every paper
  surface.
- The card on the right page had no ground of its own (the page's paper is drawn under it), so
  its words were measured against the dark binding; it has its own paper wherever it lies now.
- With a page of another part open, the card's spread placement still held and lay over the page
  (the book's moments could not be closed); the placement holds only while the Scene shows.
- On the left page the talk was squeezed into a small box, and with it open who was present ran
  off the page; the talk moved to the head of the right page.
- A result on the right page's foot lay over the card's actions; it lies on the plate (and at
  the card's foot during a talk, the card scrolling clear of it).
- In a fight seen from the Scene, whose turn it is lay over a result on the plate.
- An assembled book marked a situation's words "read aloud" though they are the DM's and may hold
  what the party has not learned; only the campaign's opening is marked so.

## Session's decisions in this stage

- The spread's width (1024 px and 600 px tall): two pages of at least about 460 px each beside the
  bookmarks. An upright tablet and a phone keep one page under the picture until the hero's spread
  of Stage 1070 puts that page on paper too.
- The ribbon shows only on the spread; elsewhere the Книга bookmark opens the story.
- An assembled book marks nothing to be read aloud but the campaign's opening (above).

## Verification

| Check                                                                             | Result                              |
| --------------------------------------------------------------------------------- | ----------------------------------- |
| `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build`  | pass                                |
| `pnpm run test` (unit)                                                            | 5,119 of 5,119                      |
| The Scene's, the book's and the card's journeys, Chromium (113, 40 files)         | 113 passed after the fixes above    |
| `tests/e2e/scene-spread.spec.ts` (new), with axe on the spread, a card and a talk | pass                                |
| The Scene in both books at 1440, 1280 × 720, 1366 × 650, 1024, 834 and 390 px     | looked at; layout audit run at 1440 |

Not run locally: every other journey, the iPad project and WebKit — CI runs them on the pull
request. Journeys share fixed ports with other sessions on this machine, so local runs wait for
them.

## Open

- A campaign whose written book waits for the owner's reading (the built-in adventures) opens the
  book assembled from its world until he has read the written one; that book then replaces it.

## Next

Stage 1060: the fight as a fold-out.
