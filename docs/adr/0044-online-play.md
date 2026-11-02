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
