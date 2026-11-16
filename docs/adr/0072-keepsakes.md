# 0072. Keepsakes: what a campaign leaves when the evenings are over

- Status: Accepted for §1 (the owner's answer «Галерея из картинок игры» and the plan's decisions
  3, 8 and 13, `docs/MEMORY_RITUAL_PLAN.md`; started on the owner's word of 2026-11-16,
  «продолжаем», typed after Stage 760's report — `reviews/OWNER_MEMORY_RITUAL_2026-11-15.json`;
  the session's own defaults in §1 are marked and stay the owner's to overrule). Later sections
  are added by their stages and are not in force until then. §1 amends ADR 0010 (a session's view
  says when it was really played), ADR 0024 §5 (the party's chapters are also read as one book),
  ADR 0041 (the campaign's card opens its book), ADR 0056 §5 (print shows the sheet or the book)
  and ADR 0071 §2 (the stars' read may list every evening).
- Context: Part 1 of the program gave every evening a chapter told from the Party, its stars and
  a place among the others. Nothing gathers them: the Chronicle shows one chapter at a time with
  its sources, for reading closely; a family has nothing to print, to send to a grandmother or to
  leaf through when the campaign is over. A session knew only the world's time, which stands
  still through most evenings, so nothing could say on which real day the table sat down.

## Decision

### 1. The book of the campaign and its gallery (Stage 770)

1. **One book, the party's.** The book is the chapters told from the Party, in the order they
   were written, and what belongs to them. Every read it is built from is made in the PARTY
   perspective, whoever opens it: the DM's own chapters, a chapter told from one character, the
   DM's secrets and every wish are in none of those reads, so they cannot reach the page or the
   paper (the plan's decision 8). The page's assembly leaves out a chapter of another perspective
   again, whatever it is given.
2. **What a page holds.** A cover: the campaign's name, the heroes (the characters the party
   knows) with their portraits as they look now, the days played. Each chapter: the real day of
   its evening, its title, the picture of its main place and the faces met, each as the party saw
   them at the world time the chapter ends (ADR 0023, Gate 06: asked for that time, the bytes
   fetched for the time the presentation chose them), its prose exactly as written, the evening's
   stars under "What we loved that evening" (a reader outside the table does not know what a
   "star" is). A gallery: the places and the faces of the chapters, each once, as the party last saw
   it there, and what the DM showed the whole party (handouts for the party; one for a single
   player is not the book's). An ending: "To be continued…" until a campaign can be finished
   (§2), then "The end". No sources, margin notes or flashbacks: those stay in the chapters' view.
3. **Nothing stands in for a picture.** A place or a face with no approved picture the party may
   see leaves no frame, mist or silhouette in the book — a name alone for a face under its
   chapter, nothing in the gallery; a group of the gallery with no picture is not shown.
4. **A session says when it was really played.** `SessionView` gains `playedFrom` and `playedTo`:
   the instants its start and its end were recorded (the events' `recordedAt`). Out-of-world
   metadata like a session's title, kept in world state by the fold and read by no decision; an
   end undone takes `playedTo` away. No migration: the events already hold their times, so every
   session ever played has its day.
5. **(S) The day an evening stands for** is the day it started — an evening that runs past
   midnight keeps its day — unless it stood open longer than twelve hours: then the day it was
   closed. A campaign from a ready adventure starts with its first session open, days before the
   table sits down; its close is when the table was there.
6. **Where it is read.** In the Chronicle, "By chapter" and "The whole book" are two views of one
   dialog; the book is one page that scrolls and reads each chapter's pictures as the reader
   comes to it — once each: a picture chosen for a past hour is not asked for again at the
   table's every move — and it is read from the server only while it is shown. A book of more
   than one chapter opens with its contents: each evening and the gallery, a press away. On a campaign's card in the account's list, "The book" opens the campaign with its
   book shown, once the party's story has a chapter: the list's entry says how many (`chapters`,
   a count and nothing of what they tell — every member may read the party's chapters). In the
   Chronicle a book with no chapter says where it begins.
7. **Paper is the browser's print** (the plan's decision 13). "Print or save as PDF" lays the same
   page beside the application for print alone, reads and draws every picture first — each drawn
   again no wider than paper needs, so a PDF stays light enough to send — and opens the
   browser's print. No page size is named: A4 and Letter both take it. The cover is a page of its
   own; chapters follow one another and the gallery after them, no picture cut in two; the page
   carries the campaign's name as its title while it prints, so a saved file is named after it.
   The browser's own print command, given while the book is shown, prints the book as well — laid
   out at that moment with the pictures already read — never an empty sheet. No PDF is made on
   the server. Inside the native apps there is no button until the shells learn to print (Stage
   750).
8. **The stars of every evening.** `GET …/reflections?book=true` lists every ended session
   (400 at most) instead of the latest twenty; who reads what is unchanged. The book asks as PARTY
   and is sent no wish.
9. **AI.** None: the book prints the prose its chapters already hold.

## Consequences

- A table can print what it played, or save it as a file, from any browser; a player who missed an
  evening reads the whole story on one page.
- The book is as rich as the chapters are: an evening closed without a chapter is not in it, and
  a campaign without approved pictures has a book of words.
- A long campaign is a long page. Pictures are read as the reader comes to them; paper reads all
  of them, and waits at most twenty seconds for one.
- The session view grew by two fields every client receives; older clients ignore them.
- Print now shows one of two pages (the character's sheet, the book), never the application.

## Invariants affected

- 1–3 (authority): nothing is written. The two instants are derived from events already recorded.
- 4–5, 11 (knowledge): every read is PARTY's; tested for the DM and a player in the journey
  (`tests/e2e/campaign-book.spec.ts`), for the stars' read in `reflection-routes.test.ts`, and in
  the assembly's unit test.
- 12 (AI optional): unchanged.
