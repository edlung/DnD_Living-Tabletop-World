# 0072. Keepsakes: what a campaign leaves when the evenings are over

- Status: Accepted for §1 (the owner's answer «Галерея из картинок игры» and the plan's decisions
  3, 8 and 13, `docs/MEMORY_RITUAL_PLAN.md`; started on the owner's word of 2026-11-16,
  «продолжаем», typed after Stage 760's report — `reviews/OWNER_MEMORY_RITUAL_2026-11-15.json`;
  the session's own defaults in §1 are marked and stay the owner's to overrule) and §2 (the
  owner's answer that the home between worlds joins the package, the plan's decision 12, the same
  word; the plan wanted §2 drafted after a campaign had been played to its end — none has been —
  so all of §2 is the session's draft and is marked). Later sections are added by their stages
  and are not in force until then. §1 amends ADR 0010 (a session's view says when it was really
  played), ADR 0024 §5 (the party's chapters are also read as one book), ADR 0041 (the campaign's
  card opens its book), ADR 0056 §5 (print shows the sheet or the book) and ADR 0071 §2 (the
  stars' read may list every evening). §2 amends ADR 0041 (the account's list has finished
  adventures), ADR 0061 §5 (the two tables move; a second guard beside the away one) and ADR 0062
  §1–2 (the notice and a person's copy name keepsakes).
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

### 2. A campaign's end and the home between worlds (Stage 780)

Every point here is the session's (S): the owner asked not to be asked, and may overrule any.

1. **A campaign can be finished.** Between sessions the DM marks it finished, with optional last
   words to the table (280 characters), and may reopen it at any time. Table data beside the
   world (`ltw_campaign_endings`, migration 0043): no event, no World Engine decision, nothing in
   world state says a campaign is over. An evening still open is closed first.
2. **Finished, it is read, not played.** Every request that would change a finished campaign is
   refused with 409 `FINISHED` before its body is read — as an away campaign's are (ADR 0061 §5),
   by a guard of the same shape. What its end still takes is named in one list
   (`ending/guard.ts`): the end itself and the keepsakes, the last evening's stars, table talk,
   what its screens show, who may come in or must go, and signing in. A route added later is
   refused until it is named there: the default is "not played".
3. **Each hero keeps one thing.** Once the campaign is finished a player chooses, for their own
   character, one thing that character carries or one chapter told from the Party, with a line
   (200 characters); chosen again it is replaced, and it may be taken back. The DM chooses for
   anyone (a child without a screen). The server takes the name — the thing's as that hero's own
   view knows it, the chapter's title — and keeps it with the keepsake: a thing lost or renamed
   later does not change what was kept. A chapter told from anyone but the Party cannot be kept.
   Reopening keeps the keepsakes (`ltw_keepsakes`).
4. **Who reads.** The end, the DM's last words and every keepsake are read by every member and a
   table display, like a star: the form says "the whole table reads it". Names are the reader's
   own. Nothing here is the DM's alone.
5. **Where it shows.** A finished campaign's lobby says so to everyone, with the DM's words, the
   way into the book and — for a player — the question of a keepsake; the DM's Session sheet has
   no start form and no next date, and lists what the heroes keep. The book (§1) ends with "What
   the heroes keep", the DM's words and "The end".
6. **The home between worlds.** The account's list sets finished campaigns apart, under
   "Adventures we finished": the days played, the heroes the party knows, the keepsakes, the book
   as the first door. What the list may show of a campaign before it is entered is what any
   member reads as the party: names, days, keepsakes — and no picture: the world's pictures are
   served to a campaign's session, not to an account (the plan's open point "pictures outside a
   campaign's session" stays open).
7. **A person's data** (ADR 0062): what a player's own heroes keep, and a DM's last words, are in
   that person's copy; the notice names them. They stay with the campaign when an account is
   deleted, as stars do.
8. **AI.** None.

## Consequences

- A table can print what it played, or save it as a file, from any browser; a player who missed an
  evening reads the whole story on one page.
- The book is as rich as the chapters are: an evening closed without a chapter is not in it, and
  a campaign without approved pictures has a book of words.
- A long campaign is a long page. Pictures are read as the reader comes to them; paper reads all
  of them, and waits at most twenty seconds for one.
- The session view grew by two fields every client receives; older clients ignore them.
- Print now shows one of two pages (the character's sheet, the book), never the application.

- (§2) A campaign has an end that the world does not know: a build from before 0043 plays a
  finished campaign on. Reopening is one press, so an end marked by mistake costs nothing.
- (§2) One more read (a primary-key lookup) on every changing request that names a campaign.
- (§2) Controls of play stay on a finished campaign's screens and are refused when pressed, as
  on an away campaign's; the lobby says why.

## Invariants affected

- 1–3 (authority): nothing is written. The two instants are derived from events already recorded.
- 4–5, 11 (knowledge): every read is PARTY's; tested for the DM and a player in the journey
  (`tests/e2e/campaign-book.spec.ts`), for the stars' read in `reflection-routes.test.ts`, and in
  the assembly's unit test.
- 12 (AI optional): unchanged.
- (§2) 1–3: the end and the keepsakes are table data; the guard refuses, it never writes. 4–5,
  11: a keepsake's name is taken in its hero's own view, so an unidentified thing is kept under
  the name that hero knows; tested per role in `ending/ending-routes.test.ts`.
