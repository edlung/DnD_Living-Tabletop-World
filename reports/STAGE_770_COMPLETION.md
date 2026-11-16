# Stage 770 completion — the book and the gallery

Work order `work-orders/STAGE_770.md`; program `docs/MEMORY_RITUAL_PLAN.md` (Part 2, decisions 3, 8
and 13); the owner's word of 2026-11-16, «продолжаем», typed after Stage 760's report, and the
word of 2026-11-15 to follow the plan without asking
(`reviews/OWNER_MEMORY_RITUAL_2026-11-15.json`); ADR 0072 §1; 2026-11-16. Status:
**AWAITING_OWNER_DISPOSITION**. Branch `claude/stage-770-book-and-gallery`, stacked on Stage 760's
(PR 42, not merged). Session model: Claude Fable 5.2.

**Read first.** The plan put Part 2 after the family playtest and asked for it to be re-read
against what the playtest shows. The owner's word «продолжаем» came after a report that said the
session stops for the playtest; the session reads it as "go on with Part 2 now" (that reading is
the session's, not the owner's words). So this stage was not re-read against a playtest: there
has been none.

## What changed

- **"The whole book" in the Chronicle.** Beside "By chapter" (the spread with its sources, as
  before; it was not named until now) the Chronicle has a second view: one parchment page that scrolls — a cover with the
  campaign's name, the heroes' portraits and the days played; each chapter told from the Party
  with the real day of its evening, the picture of its place, its prose exactly as written, the
  faces met and the evening's stars ("What we loved that evening"); a gallery of the places and
  faces, each as the party last saw it, and of what the DM showed the whole party; "To be
  continued…". A book of more than one chapter opens with its contents.
- **It is the party's, whoever opens it.** Every read behind the page is made as PARTY, for the DM
  too: a chapter told from one character or from the DM, the DM's secrets and every wish are in
  none of them.
- **Paper.** "Print or save as PDF" at the head of the page lays the same book out for paper —
  the cover a page of its own, chapters and then the gallery following one another, page numbers
  where the browser draws them — reads and draws every picture first, and opens the browser's
  print; a saved file takes the campaign's name. The browser's own print
  command prints the book too while it is shown, never an empty sheet. Not in the native apps
  until Stage 750.
- **A session's real day.** The session view says when an evening was really played
  (`playedFrom`, `playedTo`, from the recorded times of its start and its end). No migration:
  every session already played has its day.
- **From the account's list.** A campaign's card has "The book" beside "Open" once the party's
  story has a chapter (the list's entry gains a count of them).
- **Session's decisions** (the owner asked not to be asked; each may be overruled): the day an
  evening stands for is the day it started, or the day it was closed when it stood open over
  twelve hours (a campaign from a ready adventure opens its first session at its creation);
  "By chapter" and "The whole book" are two views of one dialog; the card's button appears with the
  first chapter; on paper chapters follow one another rather
  than each starting a page; nothing stands in for a missing picture; paper's pictures are drawn
  again as JPEGs no wider than 1600 pixels; in the book the stars stand under "What we loved
  that evening".

## Found and fixed on the way

- **The gallery never appeared.** It is not laid out until it has a picture, and its pictures
  were asked for only once it came near the reader's view — which something not laid out never
  does. A mark now stands where the gallery will. The first journey with pictures caught it.
- **A 16 MB PDF.** The world's pictures are kept at the size a large screen shows, some lossless;
  a three-page book weighed 16 MB. Paper's pictures are drawn again no wider than paper needs:
  1.3 MB for the same pages, and the journey holds a book of that size under 3 MB.
- **The browser's own print command printed an empty sheet** with the book open (as it does
  everywhere else in the application: print shows only a page laid out for it). The book now
  lays itself out when the browser asks. In that case a picture not yet read printed as an empty
  dashed frame; on paper such a frame is not drawn.
- **Every picture was asked for again at the table's every move**, and the book's six reads went
  on while the Chronicle was closed: both would have grown with the campaign. Pictures are read
  once; the book is read only while shown, and keeps the reader's place when put away.
- **"Near the reader's view" stopped at the page's own edge**: a margin around the window does
  not reach inside a box that scrolls, so pictures were read only once on the screen. The margin
  is the page's now.
- **The DM's views' buttons jumped ten pixels** between the two views: the chapter writer beside
  them carried a disclosure's padding and hairline. The journey holds them still.
- **Russian called the party «партия»** in two new lines; the application's word is «отряд».
- **From the independent UX, copy and accessibility pass** (no blocker; thirteen of fifteen points
  taken): no way around a long book (the contents); "Chapters / The whole book" did not say the
  difference, and the view shown was a faint tint; the print button looked like "Write a chapter"
  and did not show that it was working; a chapter's picture was taller than a phone on its side;
  the paper's cover was half empty and set in another face than the screen, the gallery's
  pictures small and its headings left behind at a sheet's foot; a saved PDF was named after the
  application; a picture shown to the party had no text alternative; the page's focus ring was
  cut by its faded edge; either button of a campaign's card turned "Open" into "Opening…"; "The
  evening's stars" above a name read as if the person were the star; the empty book's words, the
  Russian date ending in «Г.» under capitals and three more Russian wordings. Not taken:
  enlarging a gallery picture on press (the pictures are larger instead), and a print button that
  stays in view while the page scrolls (it stands at the head of the page; see the limits).

## Files

Contracts `memory/views.ts`, `session/reflections.ts`, `session/accounts.ts`. Domain `memory/records.ts`, `evolve.ts`,
`retrieval.ts`, `kernel/evolve.ts`. Server `reflections/reflection-routes.ts`, `accounts/accounts.ts`,
`testing/ui-party-campaigns.ts`, `ui-image-campaigns.ts`. Client `chronicle/keepsake/`
(`book-model.ts`, `use-book.ts`, `keepsake-view.tsx`, `keepsake-pages.tsx`, `book-pictures.tsx`,
`print-book.tsx`), `chronicle/chronicle-book.tsx`, `shell/use-shell.ts`, `shell/book-request.ts`,
`world/world-overlays.tsx`, `session/hub.tsx`, `styles/keepsake.css`, `styles/print-book.css`,
`styles/print.css`, `styles/accounts.css`, `styles/chronicle.css`, `i18n/ru-keepsake.ts`. Journeys
`tests/e2e/campaign-book.spec.ts`, `campaign-book-hub.spec.ts`.

## Verification

Run on the branch on 2026-11-16 (offline; no paid call), after every change above:

| Check                                                         | Result                                                                                                                                                                 |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run format:check`, `lint`, `typecheck`                  | pass                                                                                                                                                                   |
| `pnpm run context-budget`                                     | pass; one earlier warning (`scripts/campaign-shared/combat-kit.ts`), none from this stage                                                                              |
| `pnpm run test` (unit)                                        | 575 files, 4628 tests pass                                                                                                                                             |
| `pnpm run test:integration` (PostgreSQL, throwaway databases) | 80 files, 396 tests pass                                                                                                                                               |
| `pnpm run build`                                              | pass                                                                                                                                                                   |
| `pnpm run test:e2e` (the whole suite)                         | 351 pass, 1 skipped by design (the pictures' journey on the iPad project), 2 fail: `table-display.spec.ts:65` and `voice.spec.ts:77` (both below)                      |
| `ui-layout-audit` (`audit.mjs` in a temporary journey)        | the book at 2560, 1440, 768, 390, 320 and 832×400 in both languages, the account's list at four sizes: no finding from this stage after the fixes; two reviewed, below |
| The paper                                                     | the PDFs of both languages read page by page: cover, chapter, gallery; page numbers; 1.3 MB with seven pictures                                                        |

The stage's journeys: `campaign-book.spec.ts` (Chromium on a laptop, WebKit on an iPad: a letter
for the party and a chapter told from Elowen; the evening closed with its chapter; a star and a
wish from the player and for Brann; the DM's book, its paper as the print media show it, a PDF on
A4 and on Letter and by the browser's own print in Chromium; the views' buttons standing still;
the player's book and everything read for it as the party; a second evening and the contents; and,
on a campaign with the curated pictures, the portraits, the place, the gallery, a pictured
handout, every picture drawn when the print opens and the PDF's weight) and
`campaign-book-hub.spec.ts` (no button and an empty book before the first chapter; the card's
button after it; the asking spent).

After the whole run nothing in the tree changed but this report.

## Adversarial pass (invariants 1–5, 11)

- Nothing is written: no command, no event, no table. The two instants are folded from events
  already recorded; no decision reads them (looked for in `packages/domain`: only the fold, the
  undo's restore and the view name them).
- Whose book: the DM writes a chapter told from Elowen and the evening's own chapter; the DM's
  book and its paper hold the second and never the first; nor does the player's, whose own
  chapter it is in "Chapters". The assembly drops a chapter of any other perspective again
  (`book-model.test.ts`).
- Wishes: the book's read of the stars is PARTY's — the DM as the party is sent `wish: null`
  (`reflection-routes.test.ts`); the journey looks through everything the player's browser read
  as the party and finds neither wish, the player's own included, and looks for both on the DM's
  page and paper.
- Handouts: one for a single player is not PARTY's to read and is dropped by the assembly too.
- Pictures: each is asked as PARTY for the world time its chapter ends and its bytes for the time
  the presentation chose them (Gate 06); a refusal leaves no picture and no stand-in.
- The account's list says how many chapters the party's story holds — a number, to a member of
  that campaign, who may read those chapters; a chapter told from a character is not counted
  (`accounts.test.ts`).
- The stars' read grew a query (`book=true`): any other value is 400; who reads what is the same
  code path.
- Looked for and left as designed: the cover's heroes are the characters the party knows, as they
  look now; a star is free text the whole table already reads; the campaign's name is on paper.

## Not verified, and limits

- **No human has read or printed it.** Every check is a machine's: journeys, the audit, one
  independent UX, copy and accessibility pass by a reviewing agent. Whether a child leafs through
  it, whether the printed pages please a parent — unknown. And the stage was not re-read against
  a playtest (see the top).
- **No real printer and no real print dialog.** "Paper" was Chromium's PDF and the print media as
  two engines lay them out. Safari's and a phone's print screens, margins a printer adds, the
  browser's own header and footer, and page numbers in a browser that does not draw page-margin
  boxes (they are then simply absent) were not seen. WebKit saved no PDF: there the paper was
  read as the print media show it.
- **A long book was not built.** One and two chapters were; "chapters' pictures are read as the
  reader comes to them" was seen on the gallery only. A campaign of thirty evenings — its page,
  its print, its twenty-second wait per picture — is untried.
- **Left as it is from the UX pass**: a gallery picture does not enlarge on a press; the print
  button stands at the head of the page and scrolls away with the cover; it has words and no
  glyph (the kit has no printer, and art is not drawn here); closing the Chronicle after "The
  book" leaves the reader in the campaign, not back in the list; a captioned picture has an empty
  text alternative (its caption names it).
- **The browser's own print** lays the book out at that moment: a picture not yet read is absent
  from that print. The button waits for all of them.
- `tests/e2e/voice.spec.ts:77` fails on this machine as in every stage before (WebRTC stays
  "connecting"); the stage touches nothing of voice. The pull request's CI decides.
- **`tests/e2e/table-display.spec.ts:65` failed in this whole run as in Stage 760's** — the TV
  kept its pairing code after the DM had paired it — and passed alone both times. Stage 760's
  report called such failures "a different one each time"; twice the same one is a pattern. Read
  in code, not proved: on the development server React's strict mode runs the screen's first
  read twice, so two codes are asked for at once; the screen shows the later asking's code, the
  browser keeps the cookie of whichever answer arrives last, and under load they can differ —
  the DM then pairs a screen whose cookie the browser no longer holds. If so it is the test
  servers' (a built client asks once), in code these stages did not touch
  (`display/display-app.tsx`, which PR 32 also edits). A follow-up of its own.
- The audit's reviewed findings: `row-content-misaligned` for a hero whose name takes one line
  among names of two (centred, as meant); `text-under-control` for a hero's name "under" the
  Chronicle's close button at 320 pixels (the name is scrolled out of the page's box there and
  not drawn). The Session sheet's Music panel and the spread's 9.9-pixel text are as before.
- Not tried: a screen reader's actual speech; the native apps (the page is there, the button is
  not).
- Nothing was deployed; no migration exists in this stage; the shared development database was
  not touched.

## For the owner

- Open the Chronicle after an evening that has a chapter, press "The whole book", then "Print or
  save as PDF": this is the page a family would keep. Say if a chapter should start a page of its
  own, or if the day should be the evening's start in every case.
- The next stage by the plan is 780, "the home between worlds" — the one the plan calls its
  largest unknown and wanted drafted after a campaign has been played to its end.
- A follow-up outside the package: the table screen's two codes on the development server
  (above), after PR 32.
