# 0073. Ideas from other tables: ten small things around play

- Status: Accepted for §1 (the owner's word of 2026-11-16, «приступай к реализации этих
  улучшений…», quoted as relayed in `reviews/OWNER_TABLE_IDEAS_2026-11-16.json`; every point of §1
  is the session's and is marked in the plan, `docs/TABLE_IDEAS_PLAN.md` decisions 3–4, and stays
  the owner's to overrule). Later sections are added by their stages and are not in force until
  then. §2–§10 are accepted on the same word; every point of them is the session's (the plan's
  decisions 5–13). §1 amends ADR 0062 §1 (the notice names error reports), ADR 0042 §2 (a table display's one
  write), ADR 0033 (one more read in the DM's live inventory) and ADR 0061 §5 (a table that names
  a campaign and stays behind). §2 amends ADR 0071 §4.5 (a request for a pause is no longer a chat
  message) and ADR 0033 (one more read in the live inventory, for the DM and the asker). §3 amends ADR 0015
  §6 (a combatant's view says what is left of its turn, to its own player and the DM). §4 amends
  ADR 0024 §5 (the Chronicle has a third view) and changes no contract. §5 amends ADR 0061 §5 (two
  tables move), ADR 0062 §1–3 (the notice, a person's copy, what deleting an account deletes) and
  ADR 0072 §2 (a finished campaign takes a private note). §6 amends ADR 0059 §1 and §3 (a place
  shown writes the table's sound; the display's "by the scene" follows the place it shows), ADR
  0042 §3 (the cast's answer says what it did to the sound) and ADR 0061 §5 (one table moves). §7
  amends ADR 0042 §5 (a seat chosen through the table's link is taken in this browser unless a
  login is asked for) and changes no contract. §8 amends ADR 0042 §3 and ADR 0044 §5 (one more
  cast, `story`). §9 amends ADR 0058 §3 (a kept handout can be sealed), ADR 0044 §5 (a handout
  can arrive from an envelope), ADR 0033 (one more read in the live inventory) and ADR 0061 §5
  (one table moves). §10 amends ADR 0071 §3 (the date takes answers), ADR 0043 §6 (the lobby's answer
  says who comes), ADR 0062 §1 (the notice names the answer) and ADR 0061 §5 (one table moves),
  and reverses decision 14 of `docs/MEMORY_RITUAL_PLAN.md`.
- Context: The program after «Память и ритуал» borrows ten things other tools for the same hobby
  do well. This ADR holds their contracts, one section a stage. The first: the client reported
  nothing. A game's screen that failed while drawing fell back to a line about a "world response"
  and one button, which signed the person out; the list of campaigns, signing in, the table's
  display and the privacy notice had no fallback at all and went blank. Nobody but the person
  holding the phone knew — and a child does not say "the page threw a TypeError", a child says "it
  does not work" or nothing.

## Decision

### 1. Client error reports (Stage 800)

1. **What a report is.** Fixed fields, each an enumeration, a number or one strict pattern:
   - how it surfaced — while drawing (`render`), as an uncaught error (`error`), as an unhandled
     rejection (`rejection`);
   - the error's class — one of a fixed list of names (`TypeError`, `RangeError`, the DOM's
     `NotAllowedError`…), `Other` for any name not on it;
   - the screen — the page (the game, the list of campaigns, signing in, the table's display, the
     workshop, the privacy notice) and, in the game, the part that was open (a sheet of the dock,
     the Chronicle, a hero's sheet, the fight);
   - the browser's family and major version, the device's system, the native shell if any — each
     worked out in the browser from its own description of itself, which is not sent;
   - the place in the program's own code: up to three frames, each a script's file name of this
     application and two numbers (line, column).

   The server adds what it knows without being told: its build (`LTW_REVISION`), the time, and —
   from the sender's own credential — whether the sender is a player, the DM or a table display
   of the campaign the report names (or, for a session or a display, of the one it is signed in
   to).

2. **What a report never is.** No message text (an error's message can quote what it failed on),
   no address or query of the page, no name, login, account, character or perspective, no stack
   beyond the three frames, no words anyone typed, nothing read from the world. The client builds
   the report from the error's class and stack alone and drops a frame that is not one of the
   application's own scripts. A report does not say who: at a family table the browser and the
   device say enough to find the phone, and a person's copy of their data (ADR 0062 §2) has
   nothing to list.
3. **What is not reported.** A request the server refused or the network dropped (the screen says
   so already), a cancelled request, the browser's "ResizeObserver loop" notice, an error from a
   script that is not the application's (an extension). At most five reports from one page load,
   and never the same one twice.
4. **Where it goes.** `POST /client-errors` on the family's own server: no third party, no SDK
   (ADR 0070, `FULL_GAME_PLAN.md` decision 10). Anyone who can load the page may send one — a
   page can break before sign-in — so the route is limited by the sender's address group and as a
   whole, and its body is two kilobytes at most. A body that claims a campaign is believed only
   for a member of it; anyone else's report is kept without a campaign. A table display sends
   one too: the one write a display makes (ADR 0042 §2 otherwise stands — the route is not a
   campaign's and changes nothing a table reads).
5. **Where it is kept.** `ltw_client_errors` (migration 0044), operations data beside the world:
   one row for each distinct report of a campaign (or of none), with a count and its first and
   last time. A row is removed thirty days after it was last seen, and a campaign holds a hundred
   at most (the longest unseen give way). The server's log says that a report came and from what
   kind of sender, not what it held: the table is the one copy, so the thirty days are true. The
   table stays with its server when a campaign moves (ADR 0061 §5): it describes this server's
   client.
6. **Who reads.** The DM reads their campaign's list (`GET /campaigns/:id/client-errors`) at the
   top of the Session sheet, and clears it. While the list holds something the DM has not looked
   at, a line among the table's questions over the stage says so, with "What broke" (the list)
   and "Not now"; what the DM has looked at is remembered in the DM's browser, as a time.
   Reports of no campaign are the operator's, in the database (`deploy/RUNBOOK.md` §9). Nobody
   else reads any: not a player, not a display.
7. **What a person sees when the page breaks.** A plain screen in place of a blank one —
   "Something went wrong", that the game itself is safe, and "Load the game again" (a session's
   screen keeps "Sign out" beside it and adds "If that does not help, tell your DM"). It says
   that a note was sent, and what the note holds, only when one did leave. The table's display,
   which nobody holds, says it will load itself again and does, three times in ten minutes at
   most. The page-wide fallback is drawn without the game's own components or providers, so it
   cannot break the way they did; a session's fallback speaks the campaign's language.
8. **The notice.** The privacy notice says what a report holds, who reads it and for how long.

### 2. A short way to a pause (Stage 810)

1. **One press.** While a session plays and is not paused, a player's own screen shows "Ask for a
   pause" among the table's questions over the stage — in a fight, in the fight's own layout,
   clear of the turn order and the fight's controls. A press sends the request; the screen then
   says "Only the DM was told that you would like a pause", and later "The DM has seen that you
   asked for a pause. You can ask again in a minute." "Our table" in "How to play" keeps its
   button: the same request, offered there while a game plays.
2. **What a request is.** That a character's player would like a pause — nothing more: no words,
   no reason, no other character. A player asks as the character they play (the DM may, playing
   one). It pauses nothing: the DM decides (ADR 0071 §4.5 stands in that).
3. **Kept nowhere.** A request lives in the server's memory, as a cheer does (ADR 0072 §3): one a
   character; gone a minute after the DM has seen it, or ten minutes after it was asked if nobody
   answered, or when the session ends. Pressed again within a minute it is the same request. It
   is not a chat message any more (this replaces ADR 0071 §4.5's whisper with fixed words): no
   table, no log line, no copy of a person's data holds one.
4. **Who reads.** The DM reads every request; the asker reads their own; no other perspective
   reads any — another player's character, the party's shared view, the public view and a table
   display are refused. The read (`GET …/pause-requests`) is in the live inventory of the DM and
   of each character's own view, where it shows that character's request only: another player's
   stream is not signalled, because nothing they read has changed.
5. **The DM's card.** Among the table's questions on the DM's screen: "Elowen asks for a pause.
   Only you see this." with "Pause the game" — the pause that exists (ADR 0043 §6), which
   answers everyone who asked — and "Not now", which tells that one player the DM has seen it.
   Neither tells the table who asked: a pause names nobody. The card's last word — that the
   game is paused, or that the asker will read the DM has seen it — stays a moment where the
   card was. On a phone the card stays over an open sheet, where the table's other questions
   give way: nothing else would tell the DM.
6. **Limits.** Twelve requests a minute from one person in one campaign reach the board at most;
   the board itself takes one a minute from a character.

### 3. "What can I do?" (Stage 820)

1. **What it is.** While a game plays, a player's own screen has "What can I do?" beside the
   way to a pause (not while the DM has paused it: every command waits then, and the lobby says
   so). In a fight the two lie in the fight's own layout — under the switch between the scene
   and the battlefield, or at the stage's lower right on a wide screen — clear of the turn
   order. It opens a short page in plain words. In a fight, on the hero's turn: what is
   left — feet of movement, the action, a bonus action, the reaction, attacks an Attack action
   still holds — each marked "You can" or "Used up", with the hero's own options as the rules list
   them now and a caster's spell slots; on another's turn: whose it is (as the viewer knows them;
   not at all when the fog hides them), that the hero waits, and the reaction; down or fallen: what
   that means; held by a condition that lets it neither move nor act (Stunned, Paralyzed…): that
   it cannot act, and nothing offered. Outside a fight: the place, what a press on the scene does, the places nearby.
   Always: "Say it aloud. The DM decides what happens: you are not limited to the buttons."
2. **Where its words come from.** Only from what the server already answers for that character:
   the fight's view, the context of the hero itself, the hero's own sheet, its surroundings. The
   page tells; it does not advise what is best, and it says nothing where the server says nothing
   (an option the rules refuse is not listed; a server that sends no budget gets a shorter page,
   never a guess). No AI.
3. **The one new thing a view says.** A combatant's view gains `turn`: whether it is its turn, and
   whether the action, the bonus action and the reaction are left, feet of walking speed left
   (Dash included) and attacks left — each as nothing left while a condition holds the
   combatant, which the view says (`incapacitated`), so the page offers nothing the rules would
   refuse. It is the DM's to read for everyone, a character's own
   player's for that character, and a commander's player's for the creature their character
   commands. No other view carries it: not another player's, not the party's shared view, not a
   table display's. This amends ADR 0015 §6.
4. **What it does not do.** It submits nothing and changes nothing; three of its lines lead on —
   to Places, to the hero's sheet, to the rules reference (ADR 0055).

### 4. The party's encyclopedia (Stage 830)

1. **What it is.** "What we know" is a third view of the Chronicle, beside "By chapter" and "The
   whole book": people and creatures, places, things and factions — each with its picture as the
   party sees it now, its name, what the party knows of it and the party's chapters that tell of
   it — then what else the party has learned, and what it set out to do. A field finds a name. A
   chapter named under an entry opens in the book. Read only: nothing on the page writes.
2. **The party's, whoever opens it.** Every read the page is built from is made in the PARTY
   perspective — the directory of what the party knows, its knowledge records, its chapters, its
   quests, its pictures — for a player and for the DM alike (the rule of the book, ADR 0072
   §1.1). The DM's secrets, a chapter told from the DM or from one character, and a record the
   party does not hold are in none of those reads, so they cannot reach the page. The page's
   assembly keeps the rule again, whatever it is handed: a name is taken from the party's
   directory only, never from a chapter or a record alone; a chapter of another perspective
   tells nothing; a record typed `SECRET` is left out.
3. **Nothing is rewritten.** A record is shown as the party holds it, with its type where it is
   not a plain fact — a rumour stays a rumour, a hypothesis a hypothesis. The page infers
   nothing: "met" and "been" are what the party's own records and chapters say.
4. **No new read, no table.** The page reads what the server already answers for PARTY; no
   contract changes.

### 5. Players' private notes and a hero's backstory (Stage 840)

1. **Two things, two rules.** A _backstory_ is the hero's: where it comes from and what it wants,
   one text a character. A _private note_ is a person's: a clue, a suspicion, a plan — theirs
   alone. Both are table data beside the world (migration 0045, `ltw_backstories`,
   `ltw_player_notes`): no World Engine decision reads either, and neither is knowledge — what a
   player writes down gives no character anything to know.
2. **Who reads a backstory.** Its character's own player, in that character's view, and the DM.
   Both write it — the DM for a child who tells it aloud; the record says who wrote last. Nobody
   else: another hero's player, the party's shared view, the public view, a table display and a
   stranger are refused. It belongs to the hero, so a new player in that seat reads it.
3. **Who reads a private note.** The person who wrote it, as the character they play — and nobody
   else. The DM does not: the DM's view has no private notes at all, and a DM who takes a
   character's view (as the DM may) finds the DM's own notes there, never the player's. A note is
   kept under its writer's own actor in the campaign: no request can name another's, and a new
   player in the same seat starts with an empty notebook.
4. **What the page says.** Each part says who reads it before a word is typed: "You and your DM
   read this. Nobody else at the table does." and "Only you read these: not the DM, not the
   other players." The server's operator can read the database, as the privacy notice says of
   everything kept.
5. **Bounds.** A backstory is 4000 characters; a note a title of 120 and a body of 4000; fifty
   notes a person a character; thirty writes a minute. A note deleted is deleted for good.
6. **Where.** A fifth tab, "Story", on the character's sheet — for the hero's own player (the
   backstory and "My notes") and for the DM (the backstory). Neither is in the live inventory:
   nobody's screen is signalled by another's writing, and a changed backstory is read when the
   sheet is opened again.
7. **Around it.** Both tables move with their campaign (ADR 0061 §5). A person's copy of their
   data lists their own heroes' backstories and the notes their own seat wrote; deleting an
   account deletes those notes — nobody else could ever read them — and leaves the backstories
   with their heroes (ADR 0062 §2–3). The privacy notice names both. A finished campaign still
   takes a note, a player's own notebook, and no longer a backstory (ADR 0072 §2).
8. **Words not yet saved.** The Story tab keeps what is typed while another tab of the sheet
   shows, and the sheet asks before it closes on words nobody saved. A backstory's field follows
   what is kept until someone types in it; if the kept text changes under the typing — the
   other of its two writers saved — the page says so before "Save" replaces it.

### 6. A scene that brings its sound (Stage 850)

1. **A place's own sound.** The DM may keep, for a place, an ambience (one of the table's
   choices: by the scene, none, or a soundscape) and one of the DM's tracks — either, or both.
   Kept where the place is shown: in the form "What the screens show", under the place chosen.
   Table data beside the world (migration 0046, `ltw_place_sounds`), the DM's alone to set and
   to read; no World Engine decision reads it.
2. **Showing switches it on.** When the DM shows a place's scene on the table's screens
   (`POST …/display/cast`, kind `scene`) and that place — the one named, or where the party is
   when none is named — brings a sound, the server writes it into the table's one sound state
   (ADR 0059 §1, §3): the ambience is set; the track plays from its start, on repeat. A track
   that is already the one playing is not restarted; a track deleted since is not played, and
   the place then brings its ambience alone. The answer says what changed, and the form says
   "The place's sound is on."
3. **Nothing else does.** Not the party's walking, not the world's scene changing, not a live
   signal: only the DM's own act of showing. What plays stays one state, read by every screen as
   before; the DM's sound controls on the Session sheet show it and change it afterwards.
4. **"By the scene" is the scene on the screen.** The table's display chose its "by the scene"
   ambience from the world's active scene even while it showed another place; it now follows
   the place it shows — the cast's, else where the scene is played. This amends ADR 0059 §1.
5. **There is no "prepared scene" in the application**: a place is what the DM shows. A prepared
   encounter's or a handout's own sound is not in this section.

### 7. A shorter way in for a guest (Stage 860)

1. **Where the way was long.** A guest who scanned the table's code met "Join the table", then
   "Choose your character", then a second page — "You are invited to a table" — whose first
   choice was a new login: a name, a login and a password of ten characters, for someone who came
   for one evening. Sitting down without a login was the third of three choices.
2. **One press on a hero.** On the table's join page, pressing a free hero takes the seat's
   single-use invitation (ADR 0042 §5) and redeems it at once in this browser — the sign-in that
   "Only this browser" has always given (ADR 0036, ADR 0041). The page says so before the press:
   "Press a hero to sit down and play on this device. Nothing to remember." From the code on the
   screen to a hero: the scan, and one press.
3. **A login for who wants one.** Under the heroes: "I want a login, to come back to this table
   from another device". Ticked, a press on a hero goes to the usual join page, as before, with
   its three choices. Nothing of that page changes, and an invitation the DM sends by link still
   opens it.
4. **What does not change.** The link, its hours, its code, its limits and its closing (ADR 0042
   §5–6); a seat taken through it is a player without a login, whom the DM's close of the evening
   may free ("Free the seats of players without a login", ADR 0071 §1) and the DM may revoke; a
   browser already signed in to another seat is still asked before its sign-in is replaced.
5. **The screen's words.** The table's display said "Scan with your phone, sign in, and choose
   your character"; it says "Scan with your phone and choose your hero."

### 8. Theatre of the mind on the table's screen (Stage 870)

1. **A cast of one picture and words.** `story`: a picture of something the party knows — a
   place, a face, a thing — or none, and up to six hundred characters of words to read aloud.
   The table's screen fills with the picture (the game's own key art where there is none) and
   sets the words over its lower part, each line the DM broke as its own paragraph. Online, it
   is every player's shared screen, and it opens there as a picture or a title card does (ADR
   0044 §5).
2. **Whose words.** The DM's own, typed; or a paragraph of the party's chapters, which the form
   offers — read in the PARTY view, so nothing told from the DM or from one character is among
   them — and puts into the same field, where the DM may change it. The words are the DM's
   responsibility on every screen, as a title card's are (ADR 0042 §3): the server stores and
   shows them as written.
3. **Below the DM.** A picture the party does not know is none: a display and a player read the
   words with no picture and not even its ID, as a picture cast of it reads a dark screen. Only
   an approved picture is ever shown (ADR 0042 §3).
4. **No narrator is called.** The idea named "the narrator's or the DM's words": the narrator's
   words that exist are the chapters' prose, and the form offers those. No AI capability and no
   paid call is added.

### 9. Sealed envelopes (Stage 880)

1. **What an envelope is.** A handout the DM kept in the library (ADR 0058 §3), sealed for the
   party ahead of time: words for its outside — up to 120 characters, "Open after the battle" —
   and what opens it. The envelope takes a copy of the handout as it stands: changing or
   deleting the library's entry afterwards changes nothing sealed. `ltw_envelopes` (migration
   0047), table data beside the world; fifty a campaign at most, sealed and opened together.
2. **What the party sees.** `GET /campaigns/:id/envelopes`: the sealed envelopes from outside —
   the label, what opens it, when it was sealed — in the Journal of every player, in a
   character's view or the party's, and for a table display in the party's. The inside (title,
   text, picture) is in no answer of that route, for anyone; the DM reads it on the DM's own
   route. An envelope is for the party: one for a single character is a handout given to them
   when the moment comes.
3. **It opens on the DM's word.** "Open it now" in the DM's list: the inside becomes a handout
   for the party by the path every handout takes (ADR 0044 §5) — it waits over each player's
   stage and marks the Journal — and the envelope leaves the party's sealed ones. Opening twice
   gives one handout. Deleting asks first: a sealed envelope deleted leaves the party's Journal
   and never opens; an opened one only leaves the DM's list, and the party keeps the handout.
4. **Or by itself, when the evening's chapter is written.** An envelope sealed "for this
   evening's chapter" names the session open at the sealing; sealed between evenings, it waits
   for the next evening's. When a chapter told from the party is written for that session — the
   ritual's close (ADR 0071 §1), or the DM writing it later from the book — every such envelope
   opens, inside the chapter's own request. A chapter told from one character or from the DM
   opens nothing, nor does a chapter of no evening. An evening that ends with no chapter leaves
   its envelopes sealed, for the DM's word.
5. **What cannot open.** A handout's picture must be of something its reader knows (ADR 0044
   §5), and an envelope may be sealed before the party does. Then it does not open: the DM is
   told why, the chapter's writing passes it by, and it stays sealed until the party knows — or
   the DM gives the words another way. The outside never names the picture.
6. **What it is not.** Not world state, not knowledge: the World Engine neither reads nor writes
   an envelope, and what is inside teaches no perspective anything until the DM's own tools say
   so. Not a cast: the table's screen shows no envelope by itself. A finished campaign seals and
   opens none. The table moves with its campaign (ADR 0061 §5).

### 10. "I'll come / I can't" for the next game (Stage 890)

1. **What it is.** One answer a character to the next game's date as it stands: comes, or cannot.
   `ltw_next_game_answers` (migration 0048), table data beside the world. This reverses decision
   14 of `docs/MEMORY_RITUAL_PLAN.md`, a session's default that left answers out of the earlier
   package: the owner's word of 2026-11-16 asked for the listed ideas, and this was on the list.
2. **Who answers.** A player for their own character, under the date in the lobby, with one
   press; the same press again takes the answer back. The DM for anyone, on the Session sheet —
   a child who has no phone and said it aloud. `POST /campaigns/:id/lobby/coming`, by the rule
   "ready" has (ADR 0043 §6). A table display answers nothing.
3. **Who reads.** The table: the lobby's answer gives each character it lists — the
   perspective's own, so nobody learns of a character they do not know — its answer or none. A
   player reads "Coming", "Can't come" and "No answer yet" under their own buttons; the DM reads
   the same per hero on the Session sheet. Nothing else shows it: not the list of campaigns, not
   the calendar file, not the table's screen (which could: it is sent the same answer).
4. **A changed date asks again.** An answer is kept with the instant it answered and read only
   for that instant: another day or hour, and every hero is unanswered again; the DM's line
   about the date changes nothing asked. A date taken away or cleared by the session it was set
   for leaves nothing to answer, and the answers are deleted then.
5. **What it is not.** No reminder and no notification — the product has no push service (ADR 0070) and none is added; the calendar file of ADR 0071 §3 is still the only thing that
   reminds. No count of who missed what, no history of answers, no "maybe". Not a perspective's
   knowledge and nothing the World Engine reads: a hero who "can't come" is not marked absent —
   that stays the DM's own switch on the evening.
6. **Around it.** The table moves with its campaign (ADR 0061 §5). An answer is the table's
   state about a hero, as "absent" is, not a line of a person's copy of their data; the privacy
   notice says that it is kept, who reads it and when it goes. A finished campaign has no date
   and takes no answer.

## Consequences

- The DM's list can be written to by anyone at the table, and — without a campaign — the
  operator's by anyone who can reach the server. Every field is an enumeration or a number but the
  three frames' file names (letters, digits, dot, dash, underscore, ending in a script's
  extension): a forged report can put a made-up file name before the DM, under "For whoever looks
  after the server", and nothing else. The limits bound how many.
- A campaign that plays on another server (ADR 0061 §5) still takes a report here and lets its DM
  read the list, but refuses "Clear the list" as it refuses every write.
- The server's build is the server's, not the page's: a tab left open across a deployment reports
  under the new build. The script's hashed file name in the place tells them apart.
- A minified place is only useful with the build at hand; no source map is served or uploaded.
- An error before the page's script runs at all (a script that failed to load, a browser too old
  to parse it) is never reported: the reporter is that script.
- The count of a row can be driven up by one broken screen in a loop only as far as five a page
  load and the address's limit allow.

- A request for a pause is lost if the server restarts within its ten minutes, and is not seen by
  a DM whose screen is closed. The line a player reads says only what is true — that the DM was
  told — and the table's own sign for a pause (ADR 0071 §4.1) stays the way that always works.
- The DM's device shows the card to whoever looks at it: a DM who shares their screen shares it.
- A pause follows a request by seconds; at a table of three a child can guess who asked. The
  application does not say; the DM's guide asks the DM not to.

- What is left of a turn was the server's alone, learned by a player one refusal at a time
  ("no action", "not enough movement"); now the hero's own screen reads it in every fight's view.
  It is that character's own state; the DM's view of everyone's adds nothing the DM could not
  already read from the rules' refusals.
- The hint's feet are of walking speed: a hero who flies or swims, stands up from prone or drags a
  grappled creature may reach less than the page says, and the rules still refuse the move.

- The encyclopedia is as full as the party's knowledge is: a campaign whose DM records little for
  the party has a short page. It shows a picture only where the party's view has one.
- A player's own character may know what the party does not; that is in the Journal, in the
  character's own view, and never on this page.

- A private note is tied to a person's seat, not to a login: a guest who sits down without a login
  and whose seat is freed after the evening finds an empty notebook next time, and the notes they
  wrote stay in the database, read by nobody, until the campaign is deleted.
- The DM cannot read a private note even to help a child who lost it, and cannot moderate what is
  written there. That is the point of the rule; a family that wants otherwise shares the screen.
- What a player writes in a backstory is not canon: the DM reads it and decides what the world
  takes from it, by the DM's own tools.

- A place's sound plays only where the table's sound plays: on a paired display and, online, on
  every screen (ADR 0059 §6). At a table with no screen and not online, keeping a sound for a
  place changes nothing anyone hears.
- Showing a place a second time sets its ambience again: a DM who changed the sound by hand and
  shows the same place again gets the place's sound back.
- Session's line "Now by the scene: …" follows the world's scene, and a display follows the
  place it shows: with "by the scene" chosen and a place shown that the party is not in, the two
  can name different ambiences. What the display plays is the place it shows.

- A shorter way in is shorter for anyone who sees the table's code while the link is open. It
  was one more page for them before, not a lock: the link's hours, its closing and the DM's sight
  of who sat down are the guard, as they were.
- A guest who sat down without a login and clears the browser, or comes with another phone next
  week, has no way back to that seat but a new link — which is what a guest's seat is. Their
  private notes (§5) stay with the old sign-in.

- The story cast puts up to six hundred characters of the DM's typing on every screen of the
  table. A build from before it reads a stored `story` cast as no cast and shows the default
  scene: after a rollback the screens show where the party is until the DM casts again.

- The label on an envelope is the DM's typing, shown to every player and readable by a paired
  display's credential: a DM who writes the secret on the outside has told it. The form says
  what the party reads.
- An envelope sealed "for this evening's chapter" between evenings opens with the next party
  chapter of any evening, including one the DM writes for an old session from the book.
- Opening marks the envelope first and gives the handout second: a server that stops between
  the two leaves an envelope marked open and nothing given. The inside is still in the DM's
  list, and the kept handout is still in the library, to give by hand.
- A build from before this section ignores the table: after a rollback the party sees no
  envelopes and none opens; nothing is lost.

- An answer says something about a person to the whole table: that is its purpose, and the
  reason there is no third choice and no word of explanation to type.
- The DM can answer for anyone and so can overwrite a player's own answer; the player sees it at
  once and can press again. Nothing records who pressed.
- An answer given for a date that then passes with no session begun stays in the table, unread,
  until the next date is set or taken away (the notice says "when that game begins or the date
  is changed or removed").
- A build from before this section ignores the table and shows the date without answers.

## Alternatives considered

- **A hosted error service.** It would send a family's devices' details to a third party and add
  an SDK; refused by the product's rules.
- **The whole message and stack.** More useful to whoever fixes it, and a path for a typed word or
  a character's secret to reach a log; refused.
- **Naming the person.** The DM would know whose phone at once; it would make an error report
  personal data with a place in the person's copy and its deletion. The browser and device are
  enough at a table of five.

- **A private note the DM can read "to keep children safe".** Then it is not private, and the page
  could not honestly say so; the table's agreement and the pause are the safety tools.
- **A backstory as canonical knowledge.** It would let a player write facts into the world;
  refused by invariant 1. The DM turns what they like of it into the world.

- **An envelope for one character.** A sealed thing with one reader is a secret kept at the
  table in front of the others; the handout given to one player already does this quietly.
- **A date or a world event that opens it.** A timer would open an envelope while nobody plays,
  and a trigger in the world would make table data depend on canon the other way round. The
  DM's word and the chapter are the two moments the table already has.
- **Showing the envelope on the table's screen as a cast.** A cast is what the DM shows now; an
  envelope waits. The DM can say it aloud, or cast a title card.

- **A reminder to those who have not answered.** It needs a push service or e-mail, which the
  product refuses, and it is the nagging the plan ruled out.
- **Marking a hero absent from "I can't".** It would turn a courtesy into table control; the DM
  decides on the evening who is absent.

## Invariants affected

None. The World Engine neither reads nor writes a report; a report carries nothing of the world,
so no perspective can learn anything through one.
