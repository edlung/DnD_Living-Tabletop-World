# Memory and ritual: the plan (Stages 710–799)

Owner request 2026-11-15, after the assessment of what the finished program missed: «сделать удобным и
увлекательным проект настолько, чтобы была масса впечатлений и хотелось всегда возвращаться ради новых
кампаний и приключений в кругу семьи и друзей. Теплый и ламповый портал в увлекательные D&D миры» —
then «Да, план» for the package «Память и ритуал». Record of the owner's answers:
`reviews/OWNER_MEMORY_RITUAL_2026-11-15.json`. Status: **Stage 710 authorized by the owner on
2026-11-15 and implemented** (`work-orders/STAGE_710.md`, `reports/STAGE_710_COMPLETION.md`). The
owner's word of the same day, typed in the working session: «не спрашивай меня, а действуй по плану
до конца» — the stages follow the plan without asking to start each, each in its own pull request,
the points the plan left open settled by the session and recorded; merges, deployment and builds on
the family's devices stay the owner's. **Stage 720 is implemented** (`work-orders/STAGE_720.md`,
`reports/STAGE_720_COMPLETION.md`). **Stage 730 is implemented** (`work-orders/STAGE_730.md`,
`reports/STAGE_730_COMPLETION.md`). **Stage 740 is implemented** (`work-orders/STAGE_740.md`,
`reports/STAGE_740_COMPLETION.md`). **Stage 760, the checkpoint, is done**
(`reports/STAGE_760_COMPLETION.md`); Stage 750 waits for PR 32. **Part 2 was started by the owner's
word of 2026-11-16, «продолжаем»**, typed after Stage 760's report — before the family playtest,
so it is not re-read against one. **Stage 770 is implemented** (`work-orders/STAGE_770.md`,
`reports/STAGE_770_COMPLETION.md`, ADR 0072 §1). It follows `docs/FULL_GAME_PLAN.md` (Stages
600–699) and `docs/NATIVE_APPS_PLAN.md` (Stage 700).

The rules, the table, the TV and the DM's tools are complete. What is thin is the ritual around play:
what happens before an evening, after it and between meetings. Advice kept from the assessment: play
first, add little; the app prompts and keeps while people talk; no AI game master in the DM's place,
no points for points, no push service (`FULL_GAME_PLAN.md` decision 10), no video.

## When it is done (the owner's checklist)

1. **Before the evening.** The home screen says when the next game is; one press puts it in the phone's
   own calendar. Whoever opens the campaign early reads "Previously…" — also the player who missed the
   last evening. A new table has agreed how it plays; a new DM has read how to run an evening.
2. **The evening opens.** The DM starts the session; the TV (online: every screen) shows "Previously…"
   and someone reads it aloud.
3. **The evening closes.** The DM ends the session and keeps the evening's moments in one step; the
   chapter is written. Every player names a star (what they liked) and a wish (what they want next);
   the stars go up on the TV; the DM sets the next date.
4. **Between meetings.** The DM prepares with the wishes at hand. The campaign's chronicle is a book
   with its pictures that prints or saves as a PDF. Finished adventures, their heroes and keepsakes
   stay on the home screen.

## Where it stands (main 9881a3e8, read in code 2026-11-15)

| Area              | There today                                                                                                                                                                                                                  | Missing or broken for the ritual                                                                                                                                                                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chapters          | The DM writes a chapter from the book (`apps/web/src/chronicle/generate-chapter.tsx`); entries from memories, prose by AI or the template (ADR 0024, 0032); the Session sheet's end offers "Write the chapter" (ADR 0043 §6) | The writer always sends `from: 0` (every chapter retells the campaign from its start, 40 entries at most) and proposes one fixed title, "Chapter I — Shadows on the Trade Road", in every campaign. A session's own window is not used, though sessions and each memory's `sessionId` are in the world. |
| Who reads         | `GET …/chronicle` lists chapters whose perspective **equals** the reader's (`packages/domain/src/chronicle/views.ts`); a player may take PARTY (`knowledge/perspective.ts`)                                                  | A chapter told from the Party (the writer's default) shows on the TV and never in a player's book: the book reads with the player's own `CHARACTER:` perspective. The book's journey writes its chapter from one character. In a family of four nobody but the TV has the party's chapter.              |
| Moments to keep   | The server suggests memories the party lived and does not hold — fights, arrivals, a new day, contradictions (ADR 0024 §6, `GET …/chronicle/suggestions`)                                                                    | No screen uses the route. The party's memories come from its members' investigation, the DM's ruling (`dm/party-sheet.tsx`) and authoring; a fight, an arrival or a new day leaves none unless the DM adds it, so an evening of travel and battle can end with "nothing to tell".                       |
| "Previously…"     | The TV's join screen shows the newest chapter's title and first paragraph (`display/cast-views.tsx` `JoinCast`); a `chronicle` cast shows its first four paragraphs                                                          | Nothing on a phone or an iPad; nothing at a session's start; nothing for the player who missed an evening.                                                                                                                                                                                              |
| The evening's end | `EndSession`, screens unpaired, guest seats freed, the chapter offered                                                                                                                                                       | No word from the players; nothing the DM reads when preparing.                                                                                                                                                                                                                                          |
| The next game     | —                                                                                                                                                                                                                            | No date anywhere. The hub's campaign card holds a name, a role, a language and characters (`AccountCampaign`).                                                                                                                                                                                          |
| Keepsake          | The book on screen with place pictures and faces (`chronicle/chapter-pages.tsx`); a printable character sheet (`character/print-sheet.tsx`, `styles/print.css`)                                                              | No printable chronicle, no gallery. A campaign has no "finished" state.                                                                                                                                                                                                                                 |
| Native apps       | Shells with haptics, keep-awake, a badge and one fixed local notification (ADR 0070)                                                                                                                                         | No file hand-over, no print, no calendar: `window.print()` and a downloaded file do nothing in the shells (not found in either shell; the printable character sheet inside the apps is unverified for the same reason).                                                                                 |
| Around the table  | The players' five-page guide (`guide/guide.tsx`), shown to the DM as well; a library campaign's `audience` ("21+") and `tone` (`contracts/src/campaign/library.ts`); per-viewer dice settings in `localStorage`              | No table agreement or pause sign; no DM guide; no text size, break reminder or reactions; no player notes or backstory (planned in Stage 630, never built, its report silent).                                                                                                                          |
| Operations        | Backups every six hours on the same host (`deploy/RUNBOOK.md` §10: the off-host copy "pending the owner's choice of location")                                                                                               | No off-host copy; no client error reports.                                                                                                                                                                                                                                                              |

## Decisions

Owner's answers of 2026-11-15 (O), and the session's defaults the owner may overrule (S).

1. **(O) Stars to the table, wishes to the DM.** Everyone at the table reads the stars; a wish is read
   by its author and the DM only.
2. **(O) The next game is a date and a calendar file.** The person's own calendar reminds. No
   notification from LTW about a date, no push service.
3. **(O) The party's album is a gallery of the game's own pictures** — places visited, faces met,
   handouts shown to the party. No uploaded photographs of people.
4. **(O) All four neighbours join the package**: the table's agreement, the DM's guide, the home
   between worlds, small comforts.
5. **(O) The native apps learn to hand a calendar file to the system and to print**, as a small stage
   of its own (a new build and install on the family's devices). Until then the apps show the date and
   the book on screen, and the buttons work in a browser.
6. **(O) The evening's ritual before the family playtest, the rest after it.** Part 1: Stages 710–760.
   Part 2: Stages 770–799, re-read against what the playtest shows before each starts.
7. **(O) Off-host backup copies are a separate task outside this package**; the server is not touched
   here. It waits for the owner's separate word and choice of place.
8. **(S) The party's story is the PARTY perspective's, everywhere.** "Previously…", the stars on the
   TV, the printed book and the gallery read as PARTY, also when the DM opens or prints them: the page
   is built from the PARTY reads, never from the DM's. A chapter told from the DM is never shown,
   exported or printed outside the DM's own book (ADR 0008, ADR 0024 §2).
9. **(S) A chapter belongs to an evening.** The chapter offered at a session's end is told from the
   Party, of that session, and takes the session's title. The DM may still write any other chapter
   from the book. (Found in Stage 710: the world's clock stands still through most evenings, so the
   chapter names its session — an optional `sessionId` on `GenerateChronicle`, ADR 0071 §1.2 — and
   does not rely on a window in world time.)
10. **(S) The app prompts, people talk.** "Previously…" is text on the screens that someone reads
    aloud; stars and wishes are a prompt on the TV and a small card on each phone; nothing is read by a
    synthetic voice, nothing blocks play, every card can be skipped. The DM may write a star or a wish
    for a child who says it aloud.
11. **(S) AI stays optional** (`FULL_GAME_PLAN.md` decision 11). Every stage works with the template
    and no key. With the owner's keys the chapter's prose is the narrator's; nothing else here calls a
    provider. No new AI capability, no new paid call.
12. **(S) Table data beside the world.** Stars and wishes, the next date, the agreement, a finished
    mark and keepsakes are table records like chat and the lobby (ADR 0043 §6, ADR 0044 §1): never
    canonical, never read by a World Engine decision, additive migrations, carried by a campaign's
    move (ADR 0061 `MOVED_TABLES`), listed in a person's copy of their data and kept as chat is when an
    account is deleted (ADR 0062).
13. **(S) The book is a print page, not a server-made file.** The browser (and, after Stage 750, the
    shell) prints it or saves it as a PDF. No PDF engine on the server.
14. **(S) Not in the package**: answers to the date ("I'll come / I can't"), a notification about the
    date, photographs, AI summaries of wishes, achievements, a synthetic narrator's voice.

## Stages

Each stage is shippable alone: its own branch and pull request, design notes in its work order (an
ADR section first where a contract changes), unit, integration and browser tests, `ui-layout-audit`
at 1440, 768 and 390 in light and dark and both languages, the UX passes for a new screen, an
adversarial pass against the knowledge boundary, a report in `reports/`. Merging and deploying are
the owner's word each time.

### Part 1 — the evening's ritual (before the family playtest)

#### 710 "Previously…" and the evening's chapter — size M

- **What people see.** _Ending:_ the Session sheet's end becomes "Close the evening": the moments the
  server suggests for this session (fights, arrivals, a new day, contradictions), each ticked or
  not, one line of the DM's own ("what mattered tonight"), then "Write the chapter" — titled as the
  session, told from the Party, for this session only. _Before the next evening:_ a player who opens
  the campaign while no session is open reads a "Previously…" card (the last party chapter's title,
  its opening, "Read on" into the book) beside "I am ready". _Opening:_ the DM's start form offers
  "Open with “Previously…”"; the TV — online, every screen — shows it, the DM's screen shows the same
  words to read aloud. The party's chapters are in every player's book, marked as the party's.
- **Where.** `dm/session-sheet.tsx` (split: it is 420 lines), `chronicle/` (the book, the writer), a
  new `chronicle/previously.tsx`, `session/lobby-banner.tsx`, `display/cast-views.tsx`.
- **Data and authority.** No new table. Kept moments are `RecordMemory` commands the World Engine
  checks (ADR 0010); the chapter is `GenerateChronicle` (ADR 0024 §4) with the session it tells; a
  player reads PARTY chapters because a player may take PARTY. No migration.
- **ADRs.** New ADR 0071 §1; amends ADR 0024 (§5: a member's book lists the party's chapters; §6:
  the suggestions' screen; the offered chapter's window), ADR 0042 §3 (the recap cast), ADR 0043 §6
  (the end's steps).
- **AI.** The template when no provider answers, as today. The recap never waits for AI.
- **Risks.** Template prose is plain: the card shows the title, the place's picture and at most three
  paragraphs, so a template chapter still reads as a recap. An evening with no moment kept has no
  chapter: the end step says so and the card falls back to the last chapter there is. A chapter
  stands on what it tells (undo beneath it is refused, ADR 0024 §4): the end step says that before
  writing. The 40-entry limit now applies to one evening.
- **Checks.** Domain: suggestions bounded by a session's window. HTTP: a player reads PARTY chapters
  and never a DM-told one; the display's reads unchanged. Journeys: an evening closed and the next
  opened by the DM, two players and a TV (Chromium and WebKit); the absent player's card.

#### 720 Stars and wishes — size M

- **What people see.** When the DM ends the session the TV shows the prompt ("A star for tonight, a
  wish for next time") and each player's phone a card with two short fields (280 characters each),
  both optional, open until the next session starts. The DM may write for a child. The DM casts "The
  evening's stars" to the TV. Between sessions the Session sheet shows the last evening's stars and,
  for the DM alone, the wishes; earlier evenings stay listed. The next "Previously…" may close with
  the stars.
- **Where.** Server `apps/server/src/reflections/` (store, routes), contracts `session/reflections.ts`,
  client `ritual/` (the card, the DM's list), the display's `stars` cast.
- **Data and authority.** Table `ltw_session_reflections` (campaign, session, author: a character or
  the DM, star, wish, written and changed times). A player writes for their own characters; the DM
  for anyone. Reads: stars — the table and, when cast, the display; wishes — the author and the DM.
  Names as each reader's perspective knows them (as chat does). A star is free text like table talk:
  the card says the whole table reads it.
- **ADRs.** ADR 0071 §2; amends ADR 0042 (a cast of table data: stars only), ADR 0061 (the table
  moves), ADR 0062 §1–2 (the notice and the copy name them).
- **Migration.** One additive table (the next free number; `0040` on main today).
- **AI.** None.
- **Risks.** A wish reaching anyone but its author and the DM is the stage's one boundary: tested per
  role, the display included, and in the live fingerprint. Children's words are personal data: in the
  privacy notice and the copy.
- **Checks.** Store and limits (unit, integration); who reads what over HTTP for a player, another
  player, the DM, a display, a stranger; the move's coverage test; the account's copy; a journey with
  two players, the DM and the TV.

#### 730 The next game — size S

- **What people see.** The DM sets "Next game" (a day, a time, an optional line such as "at
  Grandma's") at the evening's close or any time from the Session sheet. It shows on the hub's
  campaign card ("Saturday 21 November, 18:00 — in 6 days"), in the lobby banner, on the TV's join
  screen and on the stars card. "Add to calendar" gives a calendar file with reminders a day and an
  hour before. A date that passed, or a session's start, clears it.
- **Where.** Server `src/table/` (the table's state, the lobby) and `src/accounts/` (the hub's
  card); a route for the file; client `dm/session-sheet`, `session/hub.tsx`, `session/lobby-banner.tsx`,
  `display/cast-views.tsx`.
- **Data and authority.** Nullable columns on `ltw_table_states` (an instant, an optional end, a
  note of 120 characters); the DM's alone to set; every member and the display read it. The file
  (`text/calendar`) holds the campaign's name, the instant and the note — nothing of the world — and
  a stable UID so a changed date replaces the event. Times are instants shown in each device's zone.
- **ADRs.** ADR 0071 §3; amends ADR 0043 §6 (the table's state), ADR 0041 (the hub's card).
- **Migration.** Additive columns.
- **AI.** None.
- **Risks.** Inside the native apps the file button does nothing until Stage 750: the page shows it
  only where it works (a browser, or a shell that names the feature). The hub reads one more store
  per campaign: one query for all of an account's campaigns.
- **Checks.** The file's text against RFC 5545 by unit test (escaping, UTC, UID); a journey from the
  DM's form to the hub's card and the downloaded file; the display's join screen.

#### 740 The table's agreement and the DM's guide — size M

- **What people see.** _The agreement:_ once per campaign the DM fills a short page — the tone (cosy,
  adventurous, spooky, grim, and a line of their own), "not in this game" (a short list to tick and
  lines to add), the pause sign the table agreed on, a note on ages. A library campaign's `audience`
  and `tone` start it off. Players read it before their first evening (from the lobby banner) and
  say "Understood"; it stays in "How to play". "Tell the DM privately" opens the existing word to the
  DM; "Ask for a pause" sends the DM a quiet fixed message. Whether the TV shows the agreement at the
  first meeting is a design point of the stage. _The guide:_ "How to run the game" for the DM beside the
  players' guide — before the evening, the first meeting, opening, running, the TV, closing, when
  something goes wrong — and a first-evening checklist on the Session sheet of a campaign with no
  session yet.
- **Where.** Server `src/agreement/`; client `ritual/agreement.tsx`, `guide/dm-guide.tsx` (the guide
  by role), `i18n/`.
- **Data and authority.** Table `ltw_table_agreements` (one row a campaign, a bounded body) and who
  has seen which version. The DM writes; every member reads; not canonical. The guide is static text
  in both languages and holds nothing of the world.
- **ADRs.** ADR 0071 §4; amends ADR 0044 §8 (a guide by role), ADR 0061 (the tables move).
- **Migration.** Additive tables.
- **AI.** None in the stage. Open point for the owner: when AI is on, should "not in this game"
  bind the NPCs' talk and the narrator's prose? That changes prompt contracts (ADR 0020, ADR 0032)
  and is a design of its own.
- **Risks.** A form nobody fills: the page is one screen with defaults for a family table. The words
  must suit children: a UX-copy pass in both languages.
- **Checks.** Who reads and writes over HTTP; journeys (the DM fills, a player reads and agrees, the
  quiet pause reaches the DM alone); the guide's pages by role; the layout audit of both.

#### 750 The shells hand over: the calendar file and print — size S–M

- **What people see.** In LTW Player and LTW DM "Add to calendar" opens the system's own screen for
  the event, and "Print" (the character sheet today, the book in Part 2) opens the system's print
  dialog with "Save as PDF".
- **Where.** `apps/ios/LTWShell`, `apps/android`, `apps/native-shim` (the shared cases),
  `apps/web/src/native/`.
- **Data and authority.** The page asks, the shell acts on its own web view: `print` carries no
  text; the calendar file is the server's own response of one allowed type from the chosen origin,
  handed to the system and removed. No permission to read a calendar, nothing kept by the shell.
- **ADRs.** Amends ADR 0070 §2 (the message and the two feature names), §3 (a handed-over file) and
  §7.
- **Migration.** None.
- **Risks.** PR 32 (native and TV polish) is open and edits the same shells: this stage builds on
  main after it merges. A new build must be installed on every device; an older shell keeps working
  (the page offers only what the shell names). It may slip into Part 2 with no loss but the buttons.
- **Checks.** The shared cases in web, Swift and Kotlin tests; the stand-in shell's journey; a run
  on the iOS simulator (iPhone, iPad) and the Android emulator.

#### 760 The ritual's checkpoint — size S

One evening from end to end on Chromium and WebKit — the DM, two players, a TV: the agreement read,
the date in the hub, "Previously…", play, the evening closed, stars and wishes, the next date — then
the audits, the adversarial pass over every new read, the report and the handoff. Merge and
deployment on the owner's word; then the family playtest (the owner's).

### Part 2 — keepsakes (after the playtest, re-read first; started before it on the owner's word of 2026-11-16)

#### 770 The book and the gallery — size M–L

- **What people see.** "The book of the campaign" from the Chronicle and the hub: a cover (the
  campaign's name, its heroes with their portraits, the dates played), the party's chapters in order
  (title, the evening's date, the prose, the place's picture as the party saw it then, the faces
  met), the evening's stars under each chapter, a gallery (places, faces, handouts shown to the
  party), "to be continued" or "the end". On screen it scrolls; "Print or save as PDF" lays it out
  for paper (A4 and Letter).
- **Where.** Client `chronicle/keepsake/`, `styles/print-book.css`; the pattern of
  `character/print-sheet.tsx`.
- **Data and authority.** Read only, PARTY only (decision 8). One additive field: an evening's real
  date on the session view, from the recorded time of its start. No migration.
- **ADRs.** New ADR 0072 §1; amends ADR 0010 (the session view's date), ADR 0024 §5.
- **AI.** None beyond the chapters' prose that exists.
- **Risks.** Pictures must be read for the time they were chosen for (Gate 06; the class of defect
  the sibling fix of 2026-11-15 notes in `display/cast-views.tsx` and `handouts/handouts.tsx`), and
  printing must wait for them. A long campaign is a long page: chapters load as they come into view,
  print loads all. A DM printing must never see or print their own chapters there: tested.
- **Checks.** Unit tests of the page's assembly; a journey that prints to PDF in Chromium and reads
  the pages; the boundary test above; the layout audit of the screen and the print sheet.

#### 780 The home between worlds — size M–L

- **What people see.** The DM marks a campaign finished (and may reopen it). The table chooses
  keepsakes — each player one thing their hero carries or one chapter, with a line. The hub gains
  "Adventures we finished" (a cover, the dates, the heroes, the book) and each hero's keepsakes.
- **Data and authority.** A finished mark and keepsakes are table data; a finished campaign is read,
  not played, until reopened (the guard a moved campaign already has, ADR 0061 §5). Open design
  points: what the hub may show of a campaign before it is entered, and pictures outside a campaign's
  session.
- **ADRs and migration.** ADR 0072 §2; amends ADR 0041, ADR 0061; additive tables.
- **Risks.** The largest unknown of the package; its design is drafted after a campaign has been
  played to its end.

#### 790 Small comforts — size S–M

Text size for each viewer (three steps, kept beside the dice settings; the layout audit at each); a
break reminder for the DM (off, 60 or 90 minutes of an unpaused session; a "Break" card for the TV);
reactions at the table (a few fixed marks, shown for a moment on every screen and the TV, never
stored). ADR 0072 §3. Open point: the marks' art — the owner's rule is that art comes from the
OpenAI image model, so either system emoji as text or a small made set.

#### 799 The package's close — size S

Journeys, audits, report and handoff for Part 2; merge and deployment on the owner's word.

## Order and size

710 M, 720 M, 730 S, 740 M, 750 S–M, 760 S; then 770 M–L, 780 M–L, 790 S–M, 799 S. Start with 710:
it mends what the family would meet on the second evening (the party's chapter missing from every
player's book, every chapter retelling the campaign from its beginning under another campaign's
title) and everything later leans on a chapter per evening. 720 and 730 are independent of each other
and may swap. 750 waits for PR 32.

## Neighbouring gaps

- **The table's agreement for play with children** — _in this package_ (Stage 740, the owner's
  answer). Nothing exists in code; a library campaign's `audience` and `tone` are the only content
  signals and are shown only in the workshop's picker. It is cheap, and it matters most before the
  first evening.
- **A guide for a new DM** — _in this package_ (Stage 740). "How to play" has five pages for players
  and shows the same pages to the DM. Static text, no server change.
- **The home between worlds** — _in this package, Part 2_ (Stage 780). A campaign has no finished
  state and the hub lists only names and roles. Best designed after one campaign is played out.
- **Small comforts** — _in this package, Part 2_ (Stage 790): text size, a break reminder,
  reactions. The playtest decides which of them are worth their screens.
- **Players' private notes and backstory** — _next package, or Stage 790 on the owner's word._
  Planned in Stage 630 and never built; the DM has notes (ADR 0043 §5), players have none. It needs
  its own boundary design: the DM reads a backstory, nobody else; a secret note is the player's only.
- **A download button for a workshop package** — _not now._ The package's JSON is served to its
  owner; a campaign already moves between servers by the operator's tool. Nobody at a table needs it.
- **Client error reports** — _recommended before the playtest, not yet the owner's choice._ The
  client reports nothing today: a crash on a child's phone is invisible. A small stage (an error's
  name, the screen, the build; never world data or words typed) with its own ADR.
- **Off-host backup copies** — _a separate task outside this package_ (the owner's answer). The
  runbook's §10 waits for the owner's choice of place; the dumps hold everything this package
  makes worth keeping.

## Risks

- **A ritual nobody performs.** Every step is one screen, skippable, and placed where the DM already
  is (the Session sheet); the playtest is the measure, not the feature list.
- **The knowledge boundary.** New reads (wishes, the book, the gallery, stars on the TV) each get a
  per-role test and join `docs/GATE_COVERAGE.md` at their stage.
- **Scope.** The package doubled with the neighbours; Part 2 is re-read after the playtest and any
  stage may be dropped without harm to the others.
- **Native builds.** Stage 750 needs the owner's devices and waits for PR 32.
- **`main` is red on eleven browser journeys** until PR 36 merges; a stage's branch starts after it.

## What stays open

- The owner's word to start Stage 710 (`work-orders/STAGE_710.md` is a draft).
- Whether "not in this game" should bind AI when it is on (Stage 740).
- Client error reports before the playtest (above).
- Players' notes and backstory: Stage 790 or a later package.
- The reactions' art (Stage 790).
- The place for off-host backup copies (a separate task).
