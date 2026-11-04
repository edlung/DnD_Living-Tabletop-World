# Milestone D completion — atmosphere, voice, local play, release (Stages 690, 695, 697, 699)

Program `docs/FULL_GAME_PLAN.md` (Milestone D), owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`;
work orders `work-orders/STAGE_690.md`, `STAGE_695.md`, `STAGE_697.md`, `STAGE_699.md`; ADRs 0059–0062
(each written before its work); 2026-11-04. Branch `claude/full-game-d`, built on Milestone C's
`claude/full-game-c`, which is main's tree since B and C merged.

## What changed

### Stage 690 — atmosphere (ADR 0059)

- **The table's sound (690a).** Five soundscapes synthesized in the browser (rain, wind, fire, crowd,
  night), the DM's choice — one, none, or by the scene (indoors, town or wild, from what the party
  knows of the place, rain only where it is seen) — on the table's screen and, online, on every
  screen, each with its own switch and volume; "Sound on" where a screen was never pressed.
- **What came of a roll, heard (690b).** A hit, a miss, a critical hit, a success, a failure, a spell
  and healing as the dice land, with the dice's sound switch.
- **The DM's music (690c).** Tracks uploaded (MP3, OGG, M4A, WAV; 15 MB, 30 a campaign), private to
  the campaign, played once or on repeat, paused, resumed and stopped in step on the TV and online
  screens by the server's clock, the ambience lower beneath it; streamed from the app's own origin a
  range at a time.
- **The table screen's moments (690d).** Another cast fades in; a new place's title card; a roll the
  table may see big over the cast with its dice and its sound.

### Stage 695 — voice (ADR 0060)

- **The room (695a).** While a session plays online, the DM and the players (eight at most) join the
  table's voice; the server relays only the connections' offers, answers and candidates between two
  members of the room, never the sound (encrypted between the screens); the DM mutes or removes a
  speaker; short-lived relay credentials when a relay is set.
- **The speakers' screens (695b).** Join and leave, the microphone on or held to talk (the button or
  Space), the microphone's choice, a refused microphone explained (the screen still listens), "this
  screen shares a room with another" (it plays no voices), who talks, reconnection on its own.
- **The relay (695c).** The coturn set-up written and wired (`LTW_TURN_URLS`, `LTW_TURN_SECRET`,
  RUNBOOK §14) and not started: its ports on the shared VPS are the owner's call.

### Stage 697 — local mode and a campaign's move (ADR 0061)

- **A campaign moves (697a).** It lives on one server at a time: exported for a move it is away there
  (read, not played: 409 `MOVED`, its history, seats and invitations refused by the database), and
  its package — the whole history, the table's records, its invitations, seats and the accounts that
  hold them — comes home elsewhere all or nothing, checked (digest, every row the campaign's, every
  event readable) and merged by each table's kind; the way back appends what was played. A campaign
  at home is never overwritten; a history played apart is refused.
- **The laptop (697b).** `deploy/local/ltw-local.sh start` runs the deployment's own stack on the
  laptop's home-network address (its own settings and backups, AI off), says what the firewall
  should allow, and shows the join address with a QR code; `bring` and `return` move a campaign over
  the operator's SSH. The proxy's local mode answers private addresses only and serves the trust
  page: the laptop's root certificate to install, the steps for iPhone, Android and a computer in
  Russian and English, and a check that says when the device trusts the laptop.
- **Checked (697c).** `deploy/verify/local-mode.sh` on the loopback address: the trust page, the
  root, the IP certificate's chain with no server name, readiness, a campaign away and home again.

### Stage 699 — release 1.0 (ADR 0062)

- **A person's data (699a).** The privacy notice (`/privacy`, both languages); "Download my data" (a
  JSON copy of the account, its sign-ins and what it wrote and rolled); "Delete my account" (the
  password and the login again; the person forgotten, the story kept); a DM's account deleted by the
  operator (`delete-account`).
- **The release journeys (699b).** A DM with a login leads a new campaign of The Bells of Hollowmere
  from the hub and seats three players with logins of their own; at the table a TV pairs and shows
  the scene, the session starts, a player's roll reaches the DM and the session ends; online every
  player has the table's screen and the DM's title card, and the table talks in chat — in Chromium
  and in WebKit.
- **The release checks (699c).** An independent security review of the milestone's changes and our
  own pass over the move's import; the layout audit of every screen of the release; their fixes
  (below).

## Found and fixed

- **The security review.** Voice: a screen that never read its stream could grow the server's
  memory (now dropped at 256 KB); the signal limit reset on every reconnection (now counted per
  person); the DM's mute and removal did not outlast a reload (now held until the room ends); a
  speaker whose seat, account or session ended stayed in the room (now checked every 20 s); the
  relay's credentials came at any time (now only while the room is open). A campaign away: an
  invitation redeemed or claimed there was written before the history refused it and blocked the
  way back (now 409 `MOVED` first, and the rows refuse changes while away). An import could set the
  password of an account this server knew, or merge a row whose key another campaign holds (now
  refused). Deleting an account now ends its sessions after the account is forgotten; uploads are
  refused before their bodies are read and the proxy caps bodies at 16 MB.
- **The layout audit** of every screen of the release: the DM's and a player's every sheet and
  dialog, at the table and online, and the screens around the game (signed out, the privacy notice,
  the TV before pairing, an invitation, the hub) — 1440, 768, 390 and 320 px, light and dark, in
  English and in Russian, 896 views. It found two defects:
  - The Chronicle's chapter writer, closed while a tablet turned upright or a window narrowed,
    opened at the old window's width (752 px on a 390 px phone) or as nothing at all: Chromium keeps
    a closed disclosure's content out of layout. The form is now made only while it is open, and
    keeps its own width on a tablet; `tests/e2e/chronicle-writer.spec.ts` fails on the old code.
  - The Players sheet's "Another character for this player" (Stage 630e) had no styles: its button
    sat flush under its select. Now one group, apart from the row's actions.

  After the fixes: no findings, apart from a warning that the Russian sign-in page is 21 px taller
  than a 1440 × 900 window (its words are longer; the page scrolls by that much, nothing is cut).

- **The full browser suite after the security review's fixes** (they had been checked by unit and
  integration tests, and the release journeys only) found two places where those fixes changed what
  a person meets:
  - An invitation to a campaign away now answers 409 `MOVED`, and the sign-in page read every 409 as
    "this browser is already signed in": it asked to replace a sign-in nobody had. It now says the
    campaign is played elsewhere and to ask the DM where.
  - The DM's removal from the voice now holds until the room ends, and the removed player still had
    a "Join the voice" button that could only be refused. The panel now says when they may join
    again; the next room (the table online again) takes them back.

  `campaign-moved.spec.ts` and `voice.spec.ts` follow the new rules; both new screens are audited
  (48 views, no findings).

- **CI's runs** (hosted runners, slower than the local machine) found one more thing and three
  waits too short for them:
  - The dice log listed a new roll for one frame before its dice were thrown, then hid it until
    they landed (the flight was marked after that render; Stage 510's code). New rolls are now
    taken in during the render that brings them; `dice.spec.ts` watches the log with a
    MutationObserver, which saw the roll listed before landing on the old code.
  - `library.spec.ts` now reads the table's rolls after their dice land, and the dice journeys
    give a throw 30 s; the iPad's `dm-screen.spec.ts` timed out once on Linux WebKit and passed on
    the next run, as it always does locally.

- **A walk through the voice as the DM and a player** (the UX pass of the new screens):
  - "Remove from the voice" acted at once, and since the review it holds until the room ends: a
    slip of the finger on a phone kept a player out for the rest of the online session. It now asks
    first, as deleting an account does — who and until when, opening on "Keep in the voice" — and
    focus stays in the panel either way (`voice/peer-controls.tsx`; `voice.spec.ts` keeps, then
    removes). Audited open and after: 32 views, no findings.
  - The note without a relay spoke of screens reaching each other; it now says what a family can act
    on: voices go straight between the screens, someone unheard may be on another network, and the
    DM can set up a relay.

## Verification

- On the last commit (`16b5e91e`): format, lint, typecheck and the context budget (2392 files,
  none over) clean; unit 4218 passed (531 files), integration 391 (77); build.
- The full browser suite (329 journeys: Chromium; the DM's screen on the iPad's WebKit; the release
  journeys in WebKit) on `ecb67fa6`, the commit before the voice's question: 326 in the run, the
  other three (`live-world`, `rest`, `weapons`: timeouts while the machine's load peaked near 40)
  passing on their own rerun. On `16b5e91e` the journeys the voice's change reaches: `voice`,
  `accessibility`, `online`, `chat` and the release journeys in Chromium and WebKit, all passing.
  Earlier full runs found the changes above (on `96c461fd`) and passed 327 + 2 on rerun
  (`4bccee5e`).
- The layout audit: 896 views of every screen, then 80 + 48 + 32 of what the fixes changed, and D's
  own screens again by their stages' scripts (257 views): no findings but the warning above.
- The security review: an independent reviewer over the milestone's changes, then our own pass over
  the move's import; each finding fixed with its test (`redeem-away.test.ts`,
  `move.integration.test.ts`, `voice-rooms.test.ts`, `voice-routes.test.ts`).
- CI: the first two runs on GitHub's runners failed as described above; the run on the last commit
  is the merge's check.

## What the owner does next

1. **Merge** Milestone D, PR #28 (B #26 and C #27 are in main since 2026-11-04).
2. **Deploy** to the VPS (RUNBOOK §2). The VPS runs Stages 500–540, so this deploy brings
   Milestones A–D at once: `deploy.sh` takes its protected dump first; migrations 0027–0039 only
   add (tables, columns, indexes, triggers; their `TRUNCATE` lines are guards); the review campaign
   needs its reset (§12, Stage 605's party changed the seed) and a new DM link, handed over
   privately.
3. **Voice across the internet** (optional, RUNBOOK §14): open the relay's ports on the shared VPS
   and start coturn; until then voice works where the screens reach each other directly.
4. **AI** (optional, RUNBOOK §7a, §8): keys and spending ceilings, the owner's call.
5. **At home** (RUNBOOK §15): `deploy/local/ltw-local.sh start` on the laptop, phones open the address
   the terminal shows and trust the laptop once; `bring <campaign> --from vardahei-vps` before
   playing offline, `return <campaign> --to vardahei-vps` after.
6. **The family playtest** — the owner's acceptance of release 1.0 — and then the **v1.0 tag**.
