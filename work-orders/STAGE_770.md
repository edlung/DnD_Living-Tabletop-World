# Work Order — Stage 770: The book and the gallery

Authority: the owner's word of 2026-11-16, «продолжаем», typed in the working session after Stage
760's report (which said the session stops before the family playtest); the answer «Галерея из
картинок игры» and the word of 2026-11-15 to follow the plan without asking
(`reviews/OWNER_MEMORY_RITUAL_2026-11-15.json`); program `docs/MEMORY_RITUAL_PLAN.md` (Part 2,
decisions 3, 8 and 13); ADR 0072 §1, written with the stage. Branch
`claude/stage-770-book-and-gallery`, stacked on Stage 760's branch (PR 42, not merged).

The plan put Part 2 after the family playtest, "re-read first". The owner's later word starts it
before: the re-reading had no playtest to read against, and says so in the report.

## Deliver

1. **The book**: "The whole book" in the Chronicle — a cover, the party's chapters with the real
   day of each evening, its place, its prose, the faces met and the evening's stars, the gallery,
   an ending — read as PARTY whoever opens it.
2. **The gallery**: the places and the faces of the chapters as the party last saw them, and what
   was shown to the whole party.
3. **Paper**: "Print or save as PDF" in a browser, the pictures read and drawn first.
4. **A session's real day**: `playedFrom` and `playedTo` on the session view, from the recorded
   times of its start and its end. No migration.
5. **From the account's list**: "The book" on a campaign's card.

## Session's decisions (the owner asked not to be asked; each may be overruled)

- The day an evening stands for (its start, or its close when it stood open over twelve hours).
- "By chapter" and "The whole book" are two views of the Chronicle, not a second dialog.
- The card's button is there once the party's story has a chapter; in the Chronicle a book with
  no chapter says where it begins.
- Chapters follow one another on paper (only the cover is a page of its own): less paper than a
  page a chapter.
- No stand-in for a missing picture anywhere in the book.
- Paper's pictures are drawn again as JPEGs no wider than 1600 pixels.

## Boundaries

No write, no migration, no AI call. No uploaded photographs (the owner's answer). No finished
mark and no keepsakes chosen by players (Stage 780). No print inside the native apps (Stage 750).
Nothing is deployed; merging is the owner's word.

## Checks

- Domain: a session's two instants, an end undone. HTTP: the stars' read for the book, the DM as
  the party sent no wish. Unit: the page's assembly.
- Journeys: `campaign-book.spec.ts` (Chromium, WebKit on an iPad: the DM's and a player's book,
  what was read as the party, paper as print shows it, a PDF on A4 and Letter in Chromium; the
  pictures and the PDF's weight), `campaign-book-hub.spec.ts` (the account's list).
- `ui-layout-audit` at 2560, 1440, 768, 390, 320 and 832×400 in both languages, the printed PDF
  read page by page; an independent UX, copy and accessibility pass.
- Format, lint, typecheck, context budget, unit and integration tests, build, the whole e2e suite;
  an adversarial pass recorded in the report.

## Done

`reports/STAGE_770_COMPLETION.md`, status `AWAITING_OWNER_DISPOSITION`, a pull request stacked on
Stage 760's.
