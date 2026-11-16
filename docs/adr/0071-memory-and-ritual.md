# 0071. Memory and ritual: what an evening leaves and how the next one opens

- Status: Accepted for §1 (the owner authorized Stage 710 on 2026-11-15, «Да, этап 710», with the
  plan's decisions 8–11 as written: `docs/MEMORY_RITUAL_PLAN.md`,
  `reviews/OWNER_MEMORY_RITUAL_2026-11-15.json`) and §2 (the owner's answer on who reads stars and
  wishes, and the word of the same day to follow the plan without asking; the session's own
  defaults in §2 are marked and stay the owner's to overrule) and §3 (the owner's answer «Дата +
  файл календаря» and the same word; its defaults are marked too). §3 amends ADR 0043 §6 (the
  table's state holds the date), ADR 0041 (the hub's card says it) and ADR 0042 §3 (the join screen
  says it) and §4 (the owner's answer that the table's agreement and the DM's guide join the
  package, and the same word; its defaults are marked). §4 amends ADR 0044 §8 (the guide is by
  role and ends with the table's page), ADR 0042 §3 (an `agreement` cast) and ADR 0061 §5 (the
  two tables move). Later sections are added by their
  stages and are not in force until then. §2 amends ADR 0042 §3 (a cast of table data), ADR 0043
  §6 (the screens stay paired at a session's end unless the DM unpairs them), ADR 0061 §5 (the
  table moves with its campaign) and ADR 0062 §1–2 (the notice and a person's copy name them). Amends ADR 0024 §4–6 (a chapter of one session, who reads the party's
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

### 2. Stars and wishes (Stage 720)

1. **What they are.** At an evening's end each player may name a star — what they liked — and a
   wish — what they want next time; the DM too. Table data beside the world (migration 0040,
   `ltw_session_reflections`): one entry an author a session, 280 characters each, replaced when
   written again, removed when emptied. Never canonical: no World Engine decision reads them, and
   they are no memory and no knowledge.
2. **Who reads what** (the owner's answer of 2026-11-15). Everyone at the table reads the stars: a
   player in their character's or the party's view, the DM, and a table display. A wish is read by
   its author — in that character's perspective only, not in the party's view the same player may
   take — and by the DM. An entry that holds a wish alone is not listed at all to anyone else, and
   signals nobody else. Names are the reader's own, as for table talk (ADR 0044 §1).
3. **Who writes.** A player for their own character; the DM for any character at the table — a
   child who said theirs aloud — and for themself. Between sessions only, for the session that
   ended last: the next session's start closes it. (Session's default.)
4. **Where.** A player's lobby holds a card while no session is open: whether theirs are written,
   the two fields on demand, each saying who reads it, and the table's stars so far. The DM's
   Session sheet between sessions holds the last evening's stars, its wishes folded until asked
   for (the sheet may lie open at the table), the form to write someone's for them — it starts
   from what that person already kept, so writing a star never wipes a wish — and earlier
   evenings. The table's screen shows a `stars` cast — the prompt
   while none is written, then each star — which the closing of an evening casts and the DM may
   cast again; online it opens every player's Table screen (ADR 0044 §5).
5. **The screens stay paired.** "Unpair the table's screens" at a session's end is offered and no
   longer ticked by default: the screens show the stars now and "Previously…" next time. (Session's
   default; it amends ADR 0043 §6's flow, not its rule.)
6. **A person's data.** The privacy notice names stars and wishes and who reads each; a person's
   copy lists those of their own characters, a DM's their own; a deleted account's stay with the
   campaign under the character's name, as table talk does (ADR 0062). A campaign's move carries the
   table as present state (ADR 0061 §5).
7. **AI.** None. Nothing here is sent to a provider.

### 3. The next game (Stage 730)

1. **What it is.** When the table meets again: an instant and an optional line of up to 120
   characters ("At Grandma's"), part of the table's state (migration 0041, two columns on
   `ltw_table_states`). Table data beside the world: the World Engine neither reads nor decides
   it, and it is no part of the world's clock.
2. **Who sets and who reads.** The DM alone sets, changes and takes it away, on the Session sheet
   at any time. Every member reads it in the lobby's answer, a table display too, and the account's
   hub on each campaign's card. It names nothing of the world, so it takes no perspective.
3. **When it stops.** A date is shown through its own evening and is past six hours after it
   began: the server stops sending it, with no job and no write. What could not be shown is not
   set — an evening already over, or a date further than two years ahead, is refused — so the DM
   is never told "everyone sees it" of a date nobody does. The session that starts within twelve
   hours of the date clears it; a date for a later day stays — an extra evening in between does
   not lose it. (Session's defaults; the plan said "a date that passed, or a session's start,
   clears it".)
4. **In words.** Each screen writes the instant in its own time zone, in the campaign's language
   and the reader's own flavour of it (18:00 or 6:00 PM), with how far off it is by the calendar's
   days ("today", "tomorrow", "in 6 days"), declined by the browser's own rules and counted again
   at the reader's midnight. The DM's line stands on a line of its own under the date.
5. **The calendar file.** `GET /campaigns/:id/next-game.ics` for every member inside the campaign
   (not a table display), and `GET /account/campaigns/:id/next-game.ics` for the account on its
   hub, its own campaigns only: one event of three hours — the campaign's name, the instant in
   UTC, the DM's line — with reminders a day and an hour before, a UID stable for the campaign and
   its server, and a sequence that grows with time, so a file saved after a change replaces the
   event a calendar holds. Nothing of the world, no names of people, no address of the server
   beyond the UID's host. It is sent inline under its file name: a phone's browser offers its own
   calendar, a browser that shows no calendars saves the file. The reader's own calendar reminds
   them: the product still has no push service (ADR 0070). The link is offered where a link can
   carry the sign-in — a browser signed in by its cookie — and not in the native shells until
   they can hand a file to the system (Stage 750).
6. **Where.** The lobby holds a line while no session is open, above the stars card; the hub's
   campaign card; the join screen of the table's screens; the DM's Session sheet, with the form.
   A date taken away leaves the form's fields as they were, so a slip is one press to undo.
   (Session's default: the plan also named the stars card; one line beside it says it once.)
7. **Around it.** The date moves with its campaign as the rest of the table's state does (ADR 0061
   §5). It is the table's, not a person's: a person's copy of their data does not list it.
8. **AI.** None.

### 4. The table's agreement and the DM's guide (Stage 740)

1. **The agreement.** One short page a campaign, the DM's to write: the tone (cosy, adventurous,
   spooky or grim, and a line of the DM's own), what is not in this game (eight things to tick and
   lines of the table's own), the table's sign for a pause, a word on who plays. Table data beside
   the world (migration 0042, `ltw_table_agreements`): no World Engine decision reads it. The form
   starts from what suits a family table, so keeping it is one press.
2. **Who reads it.** Every member and a table display, the same page in every perspective — it
   holds nothing of the world. The DM may show it on the table's screens (an `agreement` cast) to
   read aloud at the first meeting; online it opens every player's Table screen.
3. **"Understood".** Said to a version of the words (`ltw_table_agreement_understood`): by a
   player for their own character, by the DM for any character — a child who said it aloud. Only
   the page as it stands may be agreed to. Changed words are a new version and ask everyone again;
   the same words written again are not. Who has said it is the DM's alone to read: no other view
   is sent the list.
4. **Where a player meets it.** A card while they have not said "Understood" to the page as it
   stands — in the lobby and over a game in play alike, because a campaign may begin with its
   first session already open; "Later" puts it away until the screen is opened again, and nothing
   blocks play. The page stays in "How to play" as its last page, "Our table".
5. **The quiet ways to the DM.** From "Our table" a player asks for a pause — the table's own
   whisper to the DM (ADR 0044 §1) with fixed words, so nobody has to find any, once a minute at most from a screen — or opens the chat
   with the DM chosen, for words of their own. Neither is a new channel, and neither pauses the
   game by itself: the DM decides.
6. **The guide by role.** "How to play" opens for the DM on "How to run the game" — before the
   evening, the first meeting, opening, running, the table's screen, closing, when something goes
   wrong — with the players' pages one press away; a player sees the players' pages only. Static
   words in both languages that name the screens as they are; nothing of the world.
7. **Before the first evening.** Until a campaign's first session has ended, the DM's Session sheet
   lists what to do first — invite, write the agreement, set the day, pair the TV — ticked where
   the application can tell, with the way to the guide.
8. **Around it.** Both tables move with their campaign (ADR 0061 §5). The marks name a character,
   not an account: a person's copy of their data does not list them, and they stay with the
   campaign (session's default, by ADR 0062's rule for table data without a person's words).
9. **AI.** None reads the agreement in this stage. Whether "not in this game" should bind the
   NPCs' talk and the narrator's prose when AI is on is the owner's open point: it changes prompt
   contracts (ADR 0020, ADR 0032) and is a design of its own.
10. **Left out** (session's default): a library campaign's `audience` and `tone` do not start the
    page off, as the plan suggested — a campaign does not record the library entry it came from,
    and the library's tone is a paragraph, not a choice. The family defaults start it instead.

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

- Stage 720: contracts `session/reflections.ts`, the `stars` cast (`display/display.ts`), the data
  copy's `reflections`; server `src/reflections/` (store, PostgreSQL store, routes), migration
  `0040_session_reflections.sql`, the live inventory's `reflections`, `MOVED_TABLES`, the data copy;
  client `ritual/` (`reflections.ts`, `stars-card.tsx`, `evening-words.tsx`, `stars-cast.tsx`,
  `stars-list.tsx`), `styles/stars.css`. The application and its live twin share one store in
  every composition (`live/live-app.ts`): without it a star signalled nobody on a server without a
  database. Rollback: additive, an older build leaves the table alone.
- Stage 730: contracts `session/lobby.ts` (`NextGame`, the lobby's answer and change),
  `session/accounts.ts` (a campaign's `nextGame`); server `src/table/next-game.ts` (when a date is
  shown and settable, the calendar file and its reply), `table-state.ts` and its PostgreSQL store,
  `lobby-routes.ts` and `accounts/account-routes.ts` (the file's two routes), `accounts/accounts.ts`; migration `0041_next_game.sql`;
  client `ritual/next-game-words.ts`, `next-game.tsx`, mounted in `dm/session-sheet.tsx`,
  `session/lobby-banner.tsx`, `session/hub.tsx`, `display/cast-views.tsx`. Rollback: additive, an
  older build leaves the columns alone and shows no date.
- Stage 740: contracts `session/agreement.ts`, the `agreement` cast (`display/display.ts`); server
  `src/agreement/` (store, PostgreSQL store, routes), migration `0042_table_agreement.sql`, the
  live inventory's `agreement`, `MOVED_TABLES`; client `ritual/agreement-words.ts`, `agreement.tsx`,
  `agreement-tool.tsx`, `guide/guide.tsx` (by role), `guide/dm-guide.ts`, `guide/our-table.tsx`,
  `dm/first-evening.tsx`, `shell/requests.ts` (a request from one corner of the screen to
  another), `styles/agreement.css`, `i18n/ru-agreement.ts`. The API context now wraps the top bar
  too. Rollback: additive, an older build leaves the tables alone.

## Invariants affected

Preserves 4 and 5 (what a player or the TV reads is the party's knowledge, never the DM's), 1–3 and
11 (kept moments and chapters are commands the World Engine decides and records), 2 and 7 (prose is
rendered from the entries and changes nothing). §2 keeps 5 for table data: a wish reaches its
author and the DM and nobody else, by listing and by signal. §3 adds nothing a perspective could leak: the date
and its line are the DM's words for the whole table, and the file carries the campaign's name only.
§4 keeps 5 for table data once more: who has said
"Understood" reaches the DM and nobody else. No invariant is weakened.
