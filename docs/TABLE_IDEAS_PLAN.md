# Ideas from other tables: the plan (Stages 800–890)

Owner request 2026-11-16, typed in a working session after it showed a list of ideas borrowed from
other D&D tools: «приступай к реализации этих улучшений. все что возможно сделай в облаке, доступ к
github у тебя есть.» Record: `reviews/OWNER_TABLE_IDEAS_2026-11-16.json` — the words are quoted as
that session relayed them; the cloud session that writes this plan did not see them typed. The
standing word of 2026-11-15, «не спрашивай меня, а действуй по плану до конца»
(`reviews/OWNER_MEMORY_RITUAL_2026-11-15.json`), is applied to this program by the sessions' reading:
the stages follow the plan without asking to start each, each in its own pull request; open product
points are settled by the session and recorded; merges, deployment, the family playtest and real
devices stay the owner's. Status: **Stage 800 is implemented** (`work-orders/STAGE_800.md`,
`reports/STAGE_800_COMPLETION.md`, ADR 0073 §1) and **Stage 810** (`work-orders/STAGE_810.md`,
`reports/STAGE_810_COMPLETION.md`, ADR 0073 §2); the later stages follow.

It follows `docs/MEMORY_RITUAL_PLAN.md` (Stages 710–799, pull requests 37–47, none merged) and is
stacked on its last branch, `claude/stage-799-package-close`. ADR 0073 holds its contracts, one
section a stage, each added by its stage.

The list is ten small things other tools do well and this one lacks. None changes what the game is:
the World Engine still decides, the DM still runs the evening, and every one of them can be left
unused.

## When it is done (the owner's checklist)

1. **Something breaks on a child's phone** — the screen says so kindly and offers to reload, and the
   DM finds a line about it on their own screen: which screen, which browser, what kind of error.
   Nothing of the story and no typed word is in it.
2. **A player needs a pause** — one press on their own screen; a card on the DM's screen and nowhere
   else.
3. **A player does not know what to do on their turn** — "What can I do?" lists it in plain words.
4. **Between games** — the party's encyclopedia: who it met, where it has been, what it knows.
5. **A hero has a story and a player has a notebook** — the backstory is read by its player and the
   DM; a private note by its player alone.
6. **The DM shows a place** — its sound and music come with it.
7. **A guest scans the TV's code** — picks a hero and plays; no login to invent.
8. **An evening without a battlefield** — the TV shows one large picture and the words read aloud.
9. **A sealed envelope** waits for the party and opens when the DM says, or when the evening's
   chapter is written.
10. **The next game** — everyone answers "I'll come" or "I can't" beside the date.

## Where it stands (`claude/stage-799-package-close` 5d95a9d2, read in code 2026-11-16)

| Area                   | There today                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Missing                                                                                                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Errors in the client   | The server logs its own requests (`platform/logging/`); `LTW_REVISION` names the server's build (`deploy/Dockerfile`). A game's session has a last-resort boundary whose one button signs the person out (`session/app.tsx` `SessionBoundary`)                                                                                                                                                                                                                                       | The client reports nothing. The list of campaigns, signing in, the table's display and the privacy notice have no boundary: a render error there leaves a blank page (`apps/web/src/main.tsx`). No client build ID. A table display may not write at all (`http/request-context.ts` `authenticate`). |
| The pause              | "How to play" → "Our table" → "Ask for a pause" (`guide/our-table.tsx`) sends a fixed whisper to the DM through chat (`ritual/agreement-words.ts` `askForPause`, ADR 0071 §4.5), once a minute                                                                                                                                                                                                                                                                                       | Three presses deep; the DM sees an unread mark on Chat (`shell/dock.tsx`) and nothing else; the request is stored as a chat message.                                                                                                                                                                 |
| What a hero can do     | `GET …/entities/:id/context` lists actions for one chosen entity, legal or not with a reason (`packages/contracts/src/context/views.ts`, `exploration/context-actions.tsx`); the fight's tray shows options for a chosen target (`combat/hud/turn-tray.tsx`, `combat/target-options.tsx`); a static guide page "Your turn in a fight"                                                                                                                                                | No read says what is left of a turn: the action, the bonus action, the reaction and movement used live in `packages/rules/src/turn.ts` and are projected nowhere (`packages/combat/src/view.ts`). With nothing chosen the tray says only "Choose a square to move, or a combatant to act."           |
| What the party knows   | PARTY reads exist for everything: `entities`, `knowledge`, `entities/:id/knowledge`, `memories`, `quests`, `chronicle`, `world-map`, `handouts`, pictures at a time (`http/routes/knowledge-routes.ts` and neighbours). The book of the campaign reads only as PARTY, whoever opens it (`chronicle/keepsake/use-book.ts`)                                                                                                                                                            | The Journal and Places sheets read the viewer's current perspective and belong to the game in play. Nothing gathers people, places and knowledge as the party's, between games.                                                                                                                      |
| Notes and backstory    | The DM's notes (`ltw_dm_notes`, `apps/server/src/dm/note-store.ts`, ADR 0043 §5); a player's free text exists once — the wish for a portrait (`character/portrait-wish.tsx`)                                                                                                                                                                                                                                                                                                         | No player notes, no backstory: no table, route or contract; the character sheet's schema holds rules data only (`packages/contracts/src/rules/character-sheet.ts`).                                                                                                                                  |
| Sound                  | One sound state a campaign in the table's state: an ambience choice ("by the scene", none, five synthesized soundscapes) and the DM's uploaded music (`packages/contracts/src/display/sound.ts`, `music.ts`, migrations 0037–0038, `dm/sound-choice.tsx`, `dm/music-panel.tsx`, ADR 0059)                                                                                                                                                                                            | A place carries no sound of its own; casting a scene changes no sound. The TV's "by the scene" follows the world's active scene, not the place the DM cast (`display/display-app.tsx`). There is no "prepared scene" in code.                                                                        |
| The guest's way in     | The DM opens a join link and casts `join`; the TV shows a QR code and a code (`display/table-links.ts`, `display/cast-views.tsx` `JoinCast`, ADR 0042 §5). The guest: "Join the table" → "Choose your character" → "You are invited to a table" with "How will you come back to this table?" defaulting to a new account (name, login, password of ten characters) → "Take your seat" → a reload (`session/table-join.tsx`, `session/join-panel.tsx`, `session/sign-in-screens.tsx`) | Two pages and three fields a guest for one evening does not need; coming back without a login is one of three radio choices, not the default.                                                                                                                                                        |
| The table's screen     | Ten cast kinds (`packages/contracts/src/display/display.ts` `castSchema`): `title` has the DM's words on the key art, `picture` an entity's picture with its name, `chronicle` a chapter's opening                                                                                                                                                                                                                                                                                   | No cast joins one large picture with words. Live narration never reaches the screen.                                                                                                                                                                                                                 |
| Handouts ahead of time | The DM's library keeps handouts for later and gives them by hand (`ltw_dm_library`, `library/library-routes.ts`, ADR 0058 §3); a given handout is read at once (`ltw_handouts`, append-only)                                                                                                                                                                                                                                                                                         | Nothing waits visibly for the party; nothing opens by itself. No hook runs when a chapter is written (`http/routes/chronicle-routes.ts`).                                                                                                                                                            |
| The next game          | A date and a line on the table's state, shown in the list of campaigns, the lobby banner and the TV's join screen, with a calendar file (ADR 0071 §3, migration 0041, `ritual/next-game.tsx`)                                                                                                                                                                                                                                                                                        | No answer to the date. `MEMORY_RITUAL_PLAN.md` decision 14 left answers out of the earlier package.                                                                                                                                                                                                  |

## Decisions

The owner's (O) and the session's defaults the owner may overrule (S).

1. **(O) The ten ideas are built, in the cloud, as far as the cloud can.** The owner's word of
   2026-11-16. What the cloud cannot do — real devices, the family at the table, the server — is
   named in every report.
2. **(S) The order is the previous session's recommendation**: what protects the family playtest
   first (error reports, the pause, the turn's hint), then what is read between games, then the
   DM's tools, the date's answers last.
3. **(S) Nothing canonical.** Everything stored here is table or operations data beside the world,
   as chat and stars are (ADR 0043 §6, ADR 0071): no World Engine decision reads it; additive
   migrations; a campaign's table data moves with it (ADR 0061 `MOVED_TABLES`), operations data
   does not.
4. **(S) An error report holds nothing of a person or the world.** A fixed vocabulary — the error's
   class, the screen, the browser's family, the place in the program's own code — and the server's
   build. No message text, no address, no name, no account, no campaign content. It stays on the
   family's server: no third-party service (ADR 0070, `FULL_GAME_PLAN.md` decision 10).
5. **(S) A pause request is nobody's but the DM's.** Not stored, not in chat, not on the TV, not in
   any other player's reads or live signal. The DM decides; the request pauses nothing by itself
   (ADR 0071 §4.5 stands).
6. **(S) The hint tells, it does not play.** "What can I do?" is built from what the server already
   answers for that character, in fixed words. No AI, no advice on what is best, nothing the
   character could not see.
7. **(S) The encyclopedia is the PARTY's, whoever opens it** — the rule of the book
   (`MEMORY_RITUAL_PLAN.md` decision 8, ADR 0072 §1). Read only; no new server read unless a stage
   finds one missing.
8. **(S) A private note is its player's alone; a backstory is its player's and the DM's.** The DM
   does not read a private note, and the page says so in both directions: a player is told the DM
   reads the backstory. The server's operator can read the database, as the privacy notice already
   says of everything. Both are a person's words: in the notice and in the person's copy of their
   data (ADR 0062).
9. **(S) A place's sound is the DM's preparation**, table data keyed by the place; it switches on
   when the DM shows that place, and the DM's hand on the sound controls always wins afterwards.
10. **(S) A guest of the table's link sits down in this browser by default**: no login unless they
    ask for one. The link, its hours and its limits stay as ADR 0042 §5–6 has them.
11. **(S) The story cast's words are the DM's own or a paragraph of a PARTY chapter**; its picture
    is one the party knows. No AI call is added for it.
12. **(S) A sealed envelope is seen from outside before it opens**: its name and that it is sealed,
    never its inside. It opens on the DM's word or when the chapter of a named evening is written.
13. **(S) An answer to the date is read by the table** and belongs to that date: a new date asks
    again. No notification from the app, no push service (decision 2 of the earlier plan stands).
    This reverses decision 14 of `MEMORY_RITUAL_PLAN.md` — a session's default there — on the
    owner's new word.
14. **(S) AI stays optional**; no stage adds a provider call. **Art**: nothing is drawn or
    generated; the UI kit's glyphs and the game's own pictures are reused.
15. **(S) Not borrowed, on purpose**: marketplaces, subscriptions, achievements for their own sake,
    an AI game master in the DM's place, heavy map tools (dynamic lighting, wall editors, token
    macros). The first two have no place in a family's own server; the third rewards the app
    instead of the evening; the fourth takes the DM's chair, which this product exists to support;
    the fifth serves a different table than a family with a TV.

## Stages

Each stage: its own branch and pull request stacked on the one before, a section of ADR 0073 first
where a contract changes, a work order, unit and integration tests, journeys on Chromium and (in CI)
WebKit on an iPad, a look at every new screen at 1440, 768, 390, 320 and 832×400 in both languages,
an independent UX, copy and accessibility pass, an adversarial pass against the knowledge boundary,
rows in `docs/AI_CONTEXT_MAP.md` and `docs/GATE_COVERAGE.md`, a report in `reports/`. After every
third stage the latest report carries a checkpoint: what is done, the merge order, what was not
verified.

### 800 Client error reports — size S–M

- **What people see.** When the page breaks while drawing, a plain screen instead of a blank one:
  "Something went wrong" and "Load the game again". The DM gets a quiet line over the stage when
  a screen of this table has reported an error, and at the top of the Session sheet a short
  list: which kind of screen (a player's, the DM's, the table's display), which browser, where,
  what kind, how many times, when last. The operator reads all of them in the database.
- **Data and authority.** Table `ltw_client_errors` (operations data): a campaign or none, the
  sender's role, fixed-vocabulary fields, a count, first and last time; grouped by what broke;
  bounded in number and kept thirty days. `POST /client-errors` takes a report from anyone who can
  load the page — a crash may come before sign-in — rate-limited by address and as a whole; a
  signed-in sender's campaign is taken from their session, never from the body. A table display
  sends one too: the one thing a display writes. The DM reads their campaign's list; nobody else
  reads any.
- **ADR.** 0073 §1; amends ADR 0062 §1 (the notice names it), ADR 0042 §2 (a display's one write).
- **Migration.** One additive table. Not moved with a campaign.
- **Risks.** A report must not become a way to write text onto the DM's screen: every field is an
  enumeration or a strict pattern. A storm of errors must not fill the disk or the log: grouped,
  capped, limited. An error inside the reporter must not loop.
- **Checks.** The report's assembly (what a stack is cut down to) by unit test; the route per
  sender — nobody, a player, the DM, a display, a stranger's claim on another campaign; limits; the
  store on PostgreSQL; a journey that breaks a screen on purpose and finds the line on the DM's.

### 810 A short way to a pause — size S

- **What people see.** While a session plays, a player's screen has "Pause" within one press. A
  press tells the DM alone and says so; a second press within a minute does nothing. The DM's
  screen shows a card among the table's questions — "Elowen asks for a pause" — with "Pause the
  game" and "Not now"; the player sees that the DM has seen it. "Our table" keeps its button, now
  the same request.
- **Data and authority.** Held in the server's memory, as cheers are (ADR 0072 §3): gone when
  answered, when the game is paused, or after ten minutes. A player asks as their own character;
  the DM reads all, a player their own only, the display and the party's shared view none.
- **ADR.** 0073 §2; amends ADR 0071 §4.5 (no longer a chat message), ADR 0033 (one more read in
  the live inventory, for the DM and the asker).
- **Migration.** None.
- **Risks.** The one boundary is another player or the TV learning that someone asked: tested per
  role and in the live signal. A child drumming on the button: one a minute.
- **Checks.** The board (unit); who asks and who reads over HTTP; the live fingerprint of another
  player unchanged; a journey with the DM, two players and a TV.

### 820 "What can I do?" on a player's turn — size M

- **What people see.** On the character's own screen, a "What can I do?" button — in a fight beside
  the turn's tray, outside one beside the scene's actions. It opens a short list in a child's
  words: on your turn what is left (move so many feet, one action, a bonus action if the hero has
  one) and what each could be for this hero; on another's turn, that it is not your turn and what
  a reaction is; outside a fight, who is here to talk to, what can be looked at, where one can go.
  Each line leads to the control that does it, or to its rule in the reference (ADR 0055).
- **Data and authority.** What the context route and the fight's view already answer for that
  character, and one addition: the viewer's own combatant says what is left of its turn (the
  action, the bonus action, the reaction, feet of movement). Own character and the DM only.
- **ADR.** 0073 §3; amends the combat view's ADR for the turn's budget.
- **Migration.** None.
- **Risks.** A hint that lies is worse than none: every line comes from a server answer, and the
  hint says nothing where the server says nothing. It must not reveal a hidden creature or whose
  hidden turn it is.
- **Checks.** The projection per viewer (own, another player, the DM, the display); the list's
  assembly by unit test; journeys in a fight and outside one.

### 830 The party's encyclopedia — size M

- **What people see.** Beside "The whole book" in the Chronicle, and from the campaign's card
  between games: "What we know" — people (a face, a name as the party knows it, what the party
  knows of them, the chapters they appear in), places (the picture, what is known, when the party
  was there), and what the party has learned and promised (knowledge and quests). Read only.
- **Data and authority.** PARTY reads only, the DM included (decision 7). No table.
- **ADR.** 0073 §4 (the rule and, if a read is missing, its contract).
- **Migration.** None.
- **Risks.** The same as the book's: a DM opening it must see no secret; pictures are the party's.
  A long campaign is a long list: grouped and searchable by name on the page.
- **Checks.** The page's assembly; the boundary test with the DM as reader against the forbidden
  markers; journeys for a player and the DM.

### 840 Players' private notes and a hero's backstory — size M

- **What people see.** On their own hero's sheet a player finds "Story" — the hero's backstory,
  with the line "Your DM reads this" — and "My notes", with "Only you read these". The DM reads
  each hero's backstory from the party's sheet and may write it for a child who tells it aloud.
- **Data and authority.** Tables `ltw_backstories` (one a character) and `ltw_player_notes`
  (bounded in number and size). Written by the character's player; the backstory also by the DM.
  Read as decision 8 says. Both move with the campaign, are in a person's copy and named in the
  notice; as chat is, they stay with the campaign when an account is deleted.
- **ADR.** 0073 §5; amends ADR 0061 (the tables move), ADR 0062 §1–2.
- **Migration.** Additive tables.
- **Risks.** The boundary is the whole stage: a note read by the DM or another player; a backstory
  read by another player or the TV. Tested per role; neither joins a live signal another reader
  could notice.
- **Checks.** Stores; who reads and writes over HTTP for the player, another player, the DM, the
  party's view, a display, a stranger; the move's coverage; the person's copy; journeys.

### 850 A scene that brings its sound — size S–M

- **What people see.** In the form that shows a place on the table's screen the DM may keep "This
  place's sound": an ambience and one of the tracks. Showing that place switches both on;
  the DM's sound controls show what plays and change it as before.
- **Data and authority.** Table data keyed by the place; the DM's alone to set and read. The
  table's sound state stays the one source of what plays (ADR 0059).
- **ADR.** 0073 §6; amends ADR 0059, ADR 0042 §3.
- **Migration.** One additive table.
- **Risks.** Sound that changes when nobody asked: only the DM's own act of showing a place
  changes it, never the party's walking. A deleted track leaves the place silent, not broken.
- **Checks.** The store; the cast's write applying the sound; a journey with a TV.

### 860 A shorter way in for a guest — size S–M

- **What people see.** From the TV's code to a hero in two presses: the page reads the table,
  shows the free heroes, and a press on one sits the guest down in this browser. "Come back with a
  login" stays, one press away, for those who want it.
- **Data and authority.** The same link, seats and limits (ADR 0042 §5–6, ADR 0036); only the
  default and the number of pages change.
- **ADR.** 0073 §7; amends ADR 0042 §5, ADR 0041.
- **Migration.** None expected.
- **Risks.** A shorter way in is a shorter way in for anyone who sees the TV: the link's hours, its
  closing and the DM's "Free the seats of players without a login" stay the guard.
- **Checks.** The sign-in flow's unit tests; the journeys of the table link, shortened; the
  account path still reachable.

### 870 Theatre of the mind on the table's screen — size S–M

- **What people see.** A cast "Story": one large picture the party knows and a few lines beneath —
  the DM's own, or a paragraph chosen from the party's chapters. Online it is every player's
  shared screen.
- **Data and authority.** A new cast kind beside `title` and `picture`; filtered for the party as
  those are (an unknown picture is not shown).
- **ADR.** 0073 §8; amends ADR 0042 §3.
- **Migration.** None (the cast is stored as it is).
- **Risks.** The DM's words on every screen are the DM's responsibility, as a title card's are.
- **Checks.** The cast's schema and its party filter; the layout on a TV's sizes; a journey.

### 880 Sealed envelopes — size M

- **What people see.** In the DM's library a kept handout may be sealed: the party sees an envelope
  with its name on the outside, in the Journal and — if cast — on the TV, and cannot read it. It
  opens when the DM presses "Open", or by itself when the chapter of the evening the DM named is
  written; then it is a handout like any other.
- **Data and authority.** Table data in the DM's library; opening gives the handout through the
  path that exists.
- **ADR.** 0073 §9; amends ADR 0058 §3, ADR 0044 §5.
- **Migration.** Additive.
- **Risks.** The inside must not travel before the opening — not in a read, not in the live
  signal. A chapter undone after it opened an envelope does not seal it again.
- **Checks.** Who reads what before and after; the chapter's opening; journeys.

### 890 "I'll come / I can't" for the next game — size S

- **What people see.** Beside the next game's date, two buttons; the table reads who comes. The DM
  may answer for a child. A changed date asks again.
- **Data and authority.** Table data: one answer a character for the date as it stands.
- **ADR.** 0073 §10; amends ADR 0071 §3. Reverses `MEMORY_RITUAL_PLAN.md` decision 14 (decision 13
  above); its report says so.
- **Migration.** One additive table.
- **Risks.** It must stay small: no reminder, no count of misses, no nagging.
- **Checks.** Who answers and who reads; the date's change; a journey.

## Order and size

800 S–M, 810 S, 820 M, 830 M, 840 M, 850 S–M, 860 S–M, 870 S–M, 880 M, 890 S. Checkpoints in the
reports of 820, 850 and 880; the close in 890's. A stage reads the code first and may change its
design, not its place; what it changed is in its report.

## Risks

- **Ten things nobody asked for at the table.** The family playtest has not happened; every stage
  is small, can be left unused and changes nothing that was there. The playtest decides which stay.
- **The knowledge boundary.** Five stages add a read that someone must not have (the pause, the
  turn's budget, notes and backstory, the envelope's inside, the encyclopedia for the DM as
  reader). Each gets a per-role test and a row in `docs/GATE_COVERAGE.md`.
- **A long stack.** Eleven pull requests on eleven unmerged ones. They merge in order; a change
  asked for in an early one is rebased through the rest.
- **Two sessions on one stack.** Another cloud session wrote Stages 790 and 799; shared lists
  (the context maps, `main.tsx`, the dictionary test, the live inventory, the finished guard) and
  migration numbers are checked again after every rebase.
- **WebKit.** A cloud session has only Chromium: the iPad project runs in the pull requests' CI.

## What stays open

- The owner's disposition of every stage, and which of the ten stay after the playtest.
- Whether "Story" should offer the narrator's fresh prose when AI is on (a new capability, not in
  this program).
- Whether a player should be able to show a private note to the DM (not in this program).
