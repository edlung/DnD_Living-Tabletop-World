# 0071. Memory and ritual: what an evening leaves and how the next one opens

- Status: Accepted for §1 (the owner authorized Stage 710 on 2026-11-15, «Да, этап 710», with the
  plan's decisions 8–11 as written: `docs/MEMORY_RITUAL_PLAN.md`,
  `reviews/OWNER_MEMORY_RITUAL_2026-11-15.json`). Later sections are added by their stages and are
  not in force until then. Amends ADR 0024 §4–6 (a chapter of one session, who reads the party's
  chapters, the suggestions' screen and their session), ADR 0042 §3 (the Chronicle cast is the recap), ADR
  0043 §6 (the end of a session) and ADR 0044 §5 (when a player's Table screen opens).
- Context: the rules, the table, the TV and the DM's tools are complete; the ritual around play is
  thin. Read in code before this stage: a chapter told from the Party was listed only to a reader
  whose perspective was exactly `PARTY`, so it showed on the TV and in no player's book; the
  chapter's writer always told the campaign from its beginning under one fixed title; the server's
  memory suggestions (ADR 0024 §6) had no screen; "last time" existed only on the TV's join screen.

## Decision

### 1. "Previously…" and the evening's chapter (Stage 710)

1. **The party's story is the PARTY perspective's.** A member's book lists the chapters told from
   that member's own perspective and the chapters told from the Party, read as PARTY — a perspective
   every player may take (ADR 0008; `resolvePerspective`). A party chapter's pages (its place's
   picture, the faces, a flashback) are read as PARTY too for every player. The DM's book is
   unchanged and reads everything as the DM. A chapter told from the DM is listed, cast and carded for the DM
   alone. Nothing on the server changes: `GET …/chronicle` keeps listing the chapters whose
   perspective is the reader's.
2. **A chapter belongs to an evening.** The world's clock moves only when time is advanced (the
   DM's control, a journey, a rest); through most of an evening, and from one evening to the next,
   it stands still, so a window in world time cannot tell two evenings apart. `GenerateChronicle`
   therefore takes an optional `sessionId`: of the window's memories the chapter then tells only
   those recorded with that session, and rests on the session as well (undoing the session's start
   beneath a standing chapter is refused). A session's chapter is told from memories: it is refused
   for an unknown session and for the DM's view, whose events name no session. A chapter without a
   session is what it always was. A memory kept in a session may be of an earlier hour of the
   world than the session's start, so the client asks for a session's chapter over all of time up
   to the session's end and heads it with the span of its own moments. The chapter offered at a
   session's end is told from the Party, of that session, under its title; the book's writer proposes the last session and its title, or
   the whole story, and no fixed title. `ChronicleGenerated` keeps version 4: every stored chapter
   stays valid with its meaning (ADR 0007's rule); a chapter written with a session is unreadable
   to a build from before this stage.
3. **Closing the evening** is three steps on the Session sheet, each of which the DM may leave out:
   - _the evening's moments_ — the suggestions of ADR 0024 §6 for the Party inside the session's
     window, each kept or not, and one line of the DM's own. Each kept moment is the suggestion's
     own `RecordMemory` draft with the open session's ID, the DM's line a CONSEQUENCE memory of the
     Party at the current world time; the World Engine decides each (ADR 0010), and a refused one is
     named and left out. They are sent before the session ends;
   - _the end_ — `EndSession`, then the table's screens unpaired and guest seats freed as before;
   - _the chapter_ — `POST …/chronicle` as in point 2. The sheet says which prose the chapter holds
     (ADR 0032, C) and warns before writing that undo beneath a standing chapter is refused (ADR
     0024 §4).

   A step that fails leaves the earlier ones standing and says so; nothing is retried silently.
   While the steps run the sheet names the one that runs — the session is gone from the table
   before a narrator has written its chapter. Afterwards the sheet says what was done and takes
   focus: with nothing to tell there is no chapter and it says why; a chapter that failed may be
   asked for again there.

4. **"Previously…"** is the newest party chapter, read as PARTY: its title, the picture of its main
   place as the party saw it at the chapter's end, at most three paragraphs of its prose exactly as
   written and in the chapter's order — those that tell its most salient moments, the later first
   among equals; the DM's line at the close is recorded with the highest salience, so it is among
   them — and a way into the book. It shows
   - to a player under the lobby banner while no session is open (the player who missed the evening
     reads the same card: a player may take PARTY whether or not their character was there);
   - to the DM on the start form, with "Open with “Previously…”" (offered when a party chapter
     exists), which casts the Chronicle as the session starts, and while that cast stands on the
     running session's panel, to read aloud, with "Show the scene" to move on;
   - on the table's screen as the Chronicle cast (ADR 0042 §3) and, online, on every player's Table
     screen as that cast already opens it (ADR 0044 §5). The join screen's "Last time" shows the
     same chapter in brief.

   The card keeps nothing in browser storage. The whole recap folds back to its brief; the brief
   is put away for the page's life by its own control. On a screen too short to hold the recap
   beside the scene (a phone held wide) the brief opens the book instead. A player's Table screen
   opens with what the DM shows when the table goes online while the page is open, not on a reload
   into a table already online (this amends ADR 0044 §5).

5. **Which memories are a session's.** A memory the game records in play carries the open
   session already (ADR 0010). The closing step sends each kept moment and the DM's line with the
   session's ID; a ruling from the Party sheet carries the session that plays. A memory recorded
   with no session — by authoring, or between sessions — belongs to no evening's chapter and is
   told by a chapter of a window. The suggestions' route takes `session`: of the window's moments
   it keeps those whose events were recorded after the session started and, once it has ended,
   before its end, so an earlier evening's moments are not offered again.
6. **AI is optional.** The prose is the narrator's when the owner's keys allow it and the template
   otherwise (ADR 0024 §3, ADR 0032). The card never waits for a provider and nothing here adds a
   paid call.

## Consequences

- No migration and no new route. Contracts: `GenerateChronicle` and the generate request take
  `sessionId`, a chapter's view names its `sessionId`, the suggestions' query takes `session`.
  Domain: `chronicle/entries.ts` (the session's memories, the session among `rests`),
  `chronicle/decide.ts` (the refusals), `chronicle/suggestions.ts` (`suggestionsOfSession`).
  Server: `http/routes/chronicle-routes.ts`. Client: `chronicle/book-chapters.ts` (the book's
  list, the newest party chapter, a session's window), `chronicle/previously.tsx`,
  `chronicle/chronicle-book.tsx`, `chronicle/generate-chapter.tsx`, `dm/session-running.tsx` and
  `dm/close-evening.tsx` with `dm/evening.ts`, `dm/session-sheet.tsx`, `dm/party-sheet.tsx` (a ruling's session),
  `session/lobby-banner.tsx`, `display/cast-views.tsx`; styles `styles/ritual.css`; Russian in
  `i18n/ru-ritual.ts`.
- Rollback: a build from before this stage cannot read a chapter written with a session, nor
  accept the new fields; once such a chapter exists, recovery needs a build of this stage or later
  (as for every new event shape; `deploy/RUNBOOK.md` §3).
- A party chapter's entries are bounded by ADR 0024's limit of 40, now per evening.
- A standing chapter refuses undo of what it tells (ADR 0024 §4): an evening closed with a chapter
  is undone chapter first.
- Tests: the domain's `session-chapter.test.ts` (two evenings at one instant of the world, the
  refusals, the session among `rests`, a session's suggestions), the HTTP tests of a session's
  chapter and of who reads which chapter (`chronicle-routes.test.ts`), the client's units, the
  journey `tests/e2e/evening-ritual.spec.ts`.

## Invariants affected

Preserves 4 and 5 (what a player or the TV reads is the party's knowledge, never the DM's), 1–3 and
11 (kept moments and chapters are commands the World Engine decides and records), 2 and 7 (prose is
rendered from the entries and changes nothing). No invariant is weakened.
