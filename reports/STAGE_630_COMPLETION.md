# Stage 630 completion — the player's companion and online play

Work order `work-orders/STAGE_630.md`; program `docs/FULL_GAME_PLAN.md` (Milestone A, decisions 4,
10, 13 and 14), owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`; ADR 0044; 2026-11-02.

## What changed

- **Table talk (630a).** The table's chat beside the world (migration 0030, append-only): to the
  table, a player's word to the DM, the DM's word to one player, in character or out of it, with
  the table's rolls woven in by time. Names are the reader's own (a character the reader does not
  know is unnamed); a table display reads none; 30 messages a minute. The Chat sheet is a column
  over the stage's right side on a tablet or a laptop and the whole screen on a phone; its log
  fades where it is cut and the compose box stays at its foot; words typed while a message is on
  its way are kept. The dock's Chat is marked while messages wait unread.
- **The first-session guide (630a).** "How to play" opens five short pages — the screens,
  exploring, a turn, the dice, talking — in English and in Russian; on a phone its button sits on
  the title's row, and below 420 px the perspective takes a row of its own so its name is read
  whole.
- **The companion's alerts (630b).** Whatever the table waits for from a player — their turn, a
  reaction, a check the DM asked for, a short rest, a handout, their creature's turn — rings two
  soft synthesized notes and vibrates where the device can when it is new, counts in the tab's
  title, and stays until answered: one column over the stage holds the lobby or the pause, the
  short rest, each check asked with its Roll, each new handout with Read. The screen stays awake
  during a session and on a paired TV; a page hidden for ten seconds opens a fresh live stream when
  it shows again. The DM's party cards and the TV show whom the table waits for.
- **The players' own dice and private rolls (630c).** The DM lets the table roll real dice
  (migration 0031); a free roll, a check, a check asked and a Hit Point Die may then carry the
  faces read off them, checked by the server against the dice and every total computed from them.
  Such a roll is marked "own dice", is not thrown again by the 3D dice, and the DM may confirm it
  once. A player rolls for the DM alone; the DM for one character; a check asked in private is
  answered so and kept off the TV.
- **Handouts and the table's screen online (630d).** The DM gives a handout from the Party sheet —
  a title, a text, a picture of something its recipient knows, or both — to the party or one
  player (migration 0032); it waits over the stage and marks the Journal until read there. Online,
  each player's dock holds the Table screen: the DM's cast in the party's view, sized to a sheet,
  opening by itself for a picture, a title card or the Chronicle. The join card stays the TV's.
- **Several characters, a commanded creature (630e).** A player may hold several characters, each
  its own perspective and knowledge; the DM gives a member another on the Players sheet; revoking
  a member releases them all. The DM hands a creature in a fight to a party character; its player
  runs its turn as its commander (the rules' suggested act or End its turn), recorded with a
  `commander` premise; the party sees its hit points; it fights the party's foes.
- **Found and fixed on the way.** The DM's dock ran off the screen with invitations (Stage 620f:
  it now measures itself — full words, short words, More). The dice table's first read for a
  player was an empty stand-in, so after every load the last three rolls were thrown again and
  every message counted unread; it now reads nothing until the character is known. The lobby
  banner lay on top of the rest banner. A Party card's waiting pill squeezed a name into
  "Starwhi / sper". The initiative strip's words for screen readers escaped its scroll pane. The
  linter needed more than its 4 GB heap (now 6 GB).
- **The fight's party rail (630f, found in the milestone's demo).** In a fight at 1440 and 1280 px
  the DM's party rail lay under the dock, which spans nearly the stage since Stage 620. From
  1200 px up it now stands at the foot of the left column, above the dock, one compact row per
  character (portrait, name, hit points, presence), bounded by the active combatant and scrolling
  with an edge fade on a short laptop screen (1366×650); a result in a fight moved to the board's
  foot on the left, above the turn tray's row, so it no longer lies over the active combatant. The
  active card's labels are 12 px and wrap: "Класс доспеха" ran past its tile.

## Verification

- Unit 3593 passed (new: chat routes; handout routes; the players' dice and private rolls;
  `castForParty`'s join card; a member given another character; several characters' perspectives
  and session; `CommandCreature` and the commander's authority and premise, and its suggestion;
  the live client's resume; what the table waits for).
- Integration 369 passed on PostgreSQL (new: chat, handouts, entered and private rolls with the
  DM's confirmation, private requests, the table's dice; migrations 0030–0032 applied).
- Browser: new journeys `chat`, `guide` (English, and Russian on a phone), `companion` (a check
  asked buzzes once, stays over the stage beside a pause, survives a reload without buzzing again,
  marks Dice, counts in the title, and the DM's card shows it), `own-dice`, `handouts`, `online`,
  `several-characters`, `commanded`, `dock-fit`; `table-display` checks the TV's waiting strip;
  `party` checks the fight's rail clear of the dock and the active combatant for the DM and a
  player at 1440×900 and 1366×650 (it fails on the old layout). The full suite in Chromium and
  the iPad's WebKit: 243 passed, at 630e and again with 630f.
- Layout audit (temporary journeys, not kept) of the chat at 1440, 1180, 820, 390 and 320 px; the
  guide; the questions over the stage; the own-dice fields; the DM's Party cards; the table's
  screen on a player's screen; the commanded turn. Fixed from it: the chat sheet cut off and too
  wide on a laptop, its Send under the dock on a phone, the perspective's clipped name, the error
  edge of the message field, the card shape and the cartouche overlap of a check with entered
  faces, the mark parted from its words on a phone, the squeezed name, the strip's escaping words,
  the table's screen scrolling inside a sheet. The milestone's demo then measured the fight's HUD
  (rail, active combatant, result, turn tray, dock) at 1440×900, 1280×800, 1280×720, 1366×650,
  1200×760, 1194×834, 1024×768 and 390×844 for the DM and a player, in English and Russian: no
  overlaps after 630f. Remaining: off-scale spacing information only.

## Adversarial notes

- Every change of the world stays the World Engine's: the hand-over of a creature is a DM command;
  a commander's acts are authorized per command against the current fight and recorded with a
  premise that names the commander's seat and the fight, so undoing the hand-over after the
  creature acted is refused as unsafe.
- Knowledge isolation: chat names, handout names and pictures, rolls and the TV's strip are each
  read per perspective; a handout's picture must be of something its recipient knows when given
  and shows only while known; a commander's suggestion comes without the DM's words (which name
  creatures); a private roll or request is the DM's and one player's only; the join card never
  reaches a player.
- A second character changes no other player's access: `CHARACTER:<id>` resolves only for the
  player's own characters; the first character keeps the PLAYER perspective, so a tab's sign-in
  watch sees no change when another is given.
- Every new table (chat, handouts, roll confirmations) is append-only; the migrations are
  additive.
- Not done here: voice (Stage 695); a handout library and handouts cast to the TV (Stage 680);
  spells that summon (Stage 650); a commanded creature's every act chosen freely (the suggestion,
  or the DM).
