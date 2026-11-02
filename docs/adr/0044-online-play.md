# 0044. Online play and the player's companion

- Status: Accepted (owner-delegated product decision 2026-11-02; `docs/FULL_GAME_PLAN.md` Stage 630,
  decisions 4, 10, 13 and 14, owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`).
- Context: a table plays in one room with phones beside the TV, or online with everyone remote. The
  same game needs a way to talk (the table, a word to the DM, the DM's word to one player), the
  player's phone as a companion that tells them when the table waits for them, and the rest of the
  plan's Stage 630.

## Decision

1. **Table talk.** A campaign's chat is table data beside the world, never canonical (migration
   0030, append-only): a message goes to the table, from a player to the DM, or from the DM to one
   player (`channel` `table`, `dm`, `player`), spoken in character or out of it (`voice`); the DM
   narrates or speaks plainly. A player speaks as the character of their perspective; the DM
   speaks as the DM. Who reads what: the DM reads every message; everyone at the table reads the
   table's; a player reads their own words to the DM and the DM's words to their character; a
   table display reads none. Names are the reader's own, as for rolls: a character the reader's
   perspective does not know is unnamed, by an opaque ID. Messages are 1–1000 characters, 30 a
   minute for each person; the latest 200 are read. The live stream signals new messages
   (`chat`), and the log weaves in the table's rolls by time. The dock's Chat is marked while
   others' messages wait unread.
2. **The Chat sheet** is a column over the stage's right side on a tablet or a laptop, so the scene
   stays in view while the table talks, and the whole screen on a phone; its log scrolls with an
   edge fade, the compose box stays at its foot, Enter sends and Shift+Enter starts a new line.
   Words typed while a message is on its way are kept and can be sent; the same words twice while
   on their way are one message.
3. **The companion's alerts.** What the table waits for from a player — their turn, a reaction
   asked of them, a check the DM asked for, a short rest — is read from the server's views only
   (the encounter, the check requests, the open rest), so a reload or a phone that slept comes
   back to the same questions; a page hidden for 10 seconds or more opens a fresh live stream when
   it shows again instead of waiting for the idle watchdog. Something new rings two soft
   synthesized notes (with the dice's sound on, at its volume) and vibrates where the device can
   (not an iPhone); what already waited when a character's table was first read is not news, and
   until a player's character is known the table reads nothing, so no old roll is thrown again
   and no old message counts as unread. The questions stay until they are answered: the turn
   banner and the reaction prompt in a fight, and over the stage one column — the session's lobby
   or its pause, the short rest, each check asked with its Roll. The tab's title counts what
   waits, and the dock's Dice is marked while a check does. The screen stays awake while a play
   session is open (Screen Wake Lock, asked again when the page shows), and on a paired table
   screen always. The DM's party cards show the checks asked of each character and not yet
   rolled; the table's screen shows whom the table waits for over every cast but the dice' own
   (the party's characters only, as the screen reads the party's view). No background push and no
   service worker (plan decision 10).
4. **One's own dice, and a roll between the DM and one player** (plan decision 13). The DM chooses
   on the Session sheet whether the players roll their own dice (the table's state, migration
   0031, `dice` `app` or `physical`). Where they do, a free roll, a check (two d20s with Advantage
   or Disadvantage), a check the DM asked and a Hit Point Die may carry the faces read off real
   dice; the DM may always enter faces. The server checks every face against its die and the count
   against the roll, and computes every total, success and healing from them as from its own dice
   (`EnteredDice`); a face that does not fit is refused (400), faces where the campaign's dice are
   the app's too (409). Such a roll is marked "own dice" in the log, the chat and on the plate,
   and is not thrown again by the 3D dice. The DM may confirm an entered roll ("the dice showed
   this", append-only `ltw_roll_confirmations`, once), and the log then says so to everyone who
   sees the roll. A player may roll for the DM alone (`private`), the DM for one character
   (`shownTo`) as well as hidden; a check the DM asks in private is answered so, and the table's
   screen does not list it. Such a roll (`audience_id`) is read by the DM and that character only.
   Attacks, damage and saves in a fight stay the World Engine's dice.
5. **Handouts and the shared view online** (plan decision 4). A handout is table material beside
   the world (migration 0032, append-only): a title, a text, a picture of an entity, or both, for
   the party or one character. The DM gives it from the Party sheet; a picture must be of
   something its recipient knows when given (the party's view, or that character's; else 422),
   and shows only while the reader knows it; names are the reader's own. The DM reads every one, a
   character's perspective the party's and its own, the party's view (a table display too) the
   party's; nobody else reads any. A handout given since the table was first read waits over the
   player's stage ("The DM gave you a handout") and marks the Journal until it is read there; it
   rings like any other question. It teaches nothing by itself: what it tells, the DM records as
   knowledge. While a session plays online, each player's dock holds the Table screen: what the DM
   casts, read in the party's view exactly as the TV reads it (`castForParty`), sized to a sheet; it
   follows the DM — a picture, a title card or the Chronicle cast opens it when no other sheet or
   dialog is open — and a battlefield cast is named, not drawn twice. The join card is a table
   display's only: below the DM, anyone else reads a dark screen (ADR 0042 §5).
