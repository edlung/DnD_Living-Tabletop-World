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
