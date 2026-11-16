# The apps and the table's screen, polished — 2026-11-15

Scope `work-orders/NATIVE_TV_POLISH_2026-11-15.md`; branch `claude/native-tv-polish` from `main`
(`e268e158`). Owner request: «давай доработаем приложения для iphone, android, ipad и вывод на
телевизор». Nothing is merged, deployed or published to a store.

## How it went

1. **Survey of `main`.** LTW DM and LTW Player were built and run on the iOS simulators (iPad Pro
   11-inch with the TV preview, iPhone) and LTW Player on the Android emulator (API 36, also at a
   tablet's size) against a local invitation-mode server; `/display` was read in Chromium and
   WebKit at 960×540, 1280×720, 1920×1080 (also at 2×) and 3840×2160 with every cast.
2. **Nineteen findings shown to the owner**, who chose three packages — the table's screen, the
   apps, the layout — and the TV's sound "from the DM's iPad". An Android TV app was offered and
   not chosen.
3. Implementation, checks, this report.

## What changed

**The table's screen (`/display`).**

- Whom the table waits for never covers the turn order: at the foot beside the battlefield, at most
  three lines over a cast (five in the rolls cast), the same ask once with its count, the rest as
  "and N more" (`display/waiting-strip.tsx`, `moments.ts` `gatherWaits`).
- A background read of the table's screen that fails for a passing reason is read again after
  2 s, doubling to 30 s, until it answers (`api/resource.ts`, `LiveRetryContext`; ADR 0033
  amendment). The world screen's reads are as on `main` (see "The second CI run" below).
  The screen says "No connection to the table…" once the signal has been away four seconds
  (`display/display-live.tsx`).
- The rolls cast fits one screen: the newest roll large, the two before it side by side.
- Type follows the screen: the root size is 16 px up to 1080 lines and grows with the screen above
  it, so 4K reads as 1080p does; the turn order, its names, the turn line and the board's name
  plates are larger; the board's squares follow (`styles/display-tv.css`).
- The quiet corner fades even while sound waits: "Sound on" alone stays. It is no bar across a
  narrow screen, its type follows the screen, a remote's arrows and OK reach it, and the unpair
  question keeps and returns focus.
- A throw without a cue is heard as dice (`moments.ts` `clatter`, the dice's own impacts).
- "The table could not be reached" tries again by itself (10 s; 60 s after too many codes).
- A scene cast to "where the party is" shows the battlefield while the party fights (ADR 0042
  amendment); the DM's sheet says so, and says when the screens cannot see a fight.
- A picture cast without an approved picture shows the name on a title card.

**The apps.**

- LTW DM's TV: sound starts without a press, no corner; the Table screen sheet's TV panel has
  "Sound on the TV" and its volume (bridge `tv-sound` → `sound`; ADR 0070 amendment).
- The table's voice works in the apps: the microphone for the chosen origin's page, audio only.
- The workshop: `/workshop/join` links open from the scanner and from a launch link; LTW DM's
  sign-in and campaign pages offer "Campaign workshop"; in the apps the workshop offers "To the
  game".
- Notifications are asked for when the table first waits for the person, after the app's own
  question; "No, thanks" is remembered.
- "Only this app" on the join page; the scanner's button has the search glyph, not an envelope; iOS describes
  its use of the local network and of the microphone.
- Inside the apps no page speaks of "this browser" any more: the signed-out page, the question
  before an invitation replaces a sign-in, signing out, the workshop's two notes, and the voice's
  refused microphone (which now points to the device's settings for the app) say "this app".
  The DM's notes about another player's seat ("the browser they joined in") are unchanged.

**Layout.**

- The top bar no longer lays its controls over the campaign's name between 1200 and 1365 px (an
  iPad or an Android tablet held wide): the wordmark gives its room below 1440 px, the session
  line below 1300 px, and the title is cut short rather than covered.
- A phone held wide (up to 1199 px wide and 500 px tall) is laid out as a phone — before, an
  Android phone turned sideways got the tablet's layout in 400 px of height, its portraits over the
  place's card — with the top bar in one row and a lower dock (`styles/short-screen.css`; every
  phone query and the board's `NARROW` carry the same condition).

## Verification

- `pnpm run format:check`, `lint`, `typecheck`, `context-budget` (2,602 files, none over the hard
  limit; the one warning is `scripts/campaign-shared/combat-kit.ts`, untouched here), unit
  **4,559/4,559**, `build`.
- Browser journeys: the full run's numbers are under "Checks run" below. New:
  `tests/e2e/display-room.spec.ts` (a fight followed, the strip at the foot and counted, the corner
  and a remote's keys, a lost network and the present after it, the screen's own retry) and
  `tests/e2e/native-polish.spec.ts` (the TV's sound through the stand-in shell, the workshop's door
  and the way back, "Only this app"). New unit tests: `api/resource.test.ts` (retries, never a
  refusal, never outside a live session), `display/moments.test.ts` (follow, gather, clatter),
  `native/shell.test.ts` through the shared cases.
- Native: `swift test` 6/6 (the shared cases with the new ones); `xcodebuild` for `LTWPlayer` and
  `LTWDM` on the simulator, no compiler warnings; `xcodegen generate` changed only the two
  `Info.plist`; `./gradlew test assembleDebug lint` green (ContractTest and QrReaderTest; lint
  without errors).
- On the iPad simulator (LTW DM, iPadOS 27.2): the top bar at 1210 px without overlap; the TV's
  window without a corner; "Sound on the TV" switched off reached the TV's own data store
  (`ltw.dice-settings` there read `sound:false`, read from the simulator's container) and the DM's
  (`ltw.tv-sound`); a fight started on the iPad moved the TV to the battlefield by itself; the
  tilted board is right in the real WKWebView; in an online session "Join the voice" answered
  "Microphone on"; the join page said «Только это приложение».
- On the Android emulator (LTW Player, API 36): `getUserMedia({audio})` raised the system's
  question and, allowed, returned one audio track, while `getUserMedia({video})` was still refused;
  a `waiting` of 1 raised the app's question and "Continue" the system's; Back, the start screen
  without a server and its Retry as before.
- Layout audit (`ui-layout-audit`, dark — the product's one theme): the DM's world and the Table
  screen sheet with the TV panel at 1440×900, 1280×800, 1210×834, 768×1024, 390×844, 320×700,
  832×400 and 750×370; the TV's cast and pairing page at 960×540, 1280×720, 1920×1080 and
  3840×2160; sign-in, workshop and join pages inside the DM's app at 1440, 768, 390 and 320 px.
  One error found and fixed (a turn-order name cut by 2 px at 4K); what remains is the audit's
  `content-too-wide` note on the TV pages, which fill the screen on purpose, and its informational
  spacing notes.
- Evidence: `reports/evidence/native-tv-polish-2026-11-15/` (before and after: the battlefield and
  the rolls cast on the TV, 4K, LTW DM on the iPad, a phone held wide; Android's questions; the
  apps' doors).

## Checks run

- The full browser run (338 journeys, Chromium plus the iPad and WebKit projects): **335 passed,
  3 failed** while the simulators, the emulator and a second server shared the machine (load
  average 28). `campaign-options.spec.ts` (a two-minute timeout) and `paint-terrain.spec.ts`
  passed when run again on the quiet machine. `voice.spec.ts` ("the DM and a player hear each
  other") fails here every time, its two browsers staying at "connecting" — and it fails the same
  way on a clean checkout of `main` (`e268e158`) on this machine, so it is this machine's WebRTC
  between two local browsers, not this change; CI ran it green on `main` and runs it on the pull
  request. The voice itself was exercised in LTW DM on the iPad simulator and the microphone on
  the Android emulator (above).
- The targeted runs after the last edits: `display-room`, `native-polish`, `native-shell`,
  `table-display`, `display-moments`, `dm-screen` (Chromium and iPad), `atmosphere` — all green.

## The pull request's first CI run

- Seven of eight checks passed; `UI and API journeys (1/3)` failed on one journey,
  `dice.spec.ts` "the DM asks for a check with a hidden DC, and the player answers it" (the plate's
  line did not show within 30 s). This branch changes no dice code, and the same journeys run
  four times each on this machine afterwards passed 36/36; the hosted runner fails a different
  journey on other runs of `main` too (`rest`, `combat-area`, `game-sign-out-identity`,
  `scene-result-layout`). The journey was left as it is; the next push runs CI again.

## After the first CI run: the app's words

- The pages reworded for the apps (above): unit 4,559/4,559, format, lint, typecheck and
  context budget again; `native-polish` (now also the signed-out page's words in the app and in a
  browser), `native-shell`, `sign-in`, `accounts` and `workshop-access` — 24/24; the layout audit
  of the signed-out page (English and Russian) and of the replace question inside the stand-in
  app at 1440, 768, 390 and 320 px — informational spacing notes only. The sign-out dialog's,
  the workshop's and the voice's lines were not opened in a shell (the same one-line change).

## The second CI run: a regression of this branch, fixed

- Run on `4a95ff4d`: `game-sign-out-identity.spec.ts`, `sign-in-tabs.spec.ts`, `sign-in.spec.ts`
  (the revocation journey: one read where none was expected) and `companion.spec.ts` failed.
- Cause: the retry of failed background reads acted on every live screen. Logging every failed
  read in these four journeys showed 93 reads dropped at the transport in open generations — the
  journeys abort a stale tab's requests on purpose (`route.abort()`), and navigation drops reads
  in flight — and each was read again 2 s, 4 s, 8 s… later. A stale tab must stay quiet until one
  of its own moments asks the server (ADR 0036 §7); with the retry it asked by itself.
- Fix: the retry is asked for by the table's screen alone (`LiveRetryContext` in
  `/display`); everywhere else `GenerationReads` behaves as on `main`. A unit test holds the
  world screen to it (`api/resource.test.ts`).
- These journeys cannot be repeated with `--repeat-each` (they share a campaign and use each
  invitation once): they were run as whole files on a fresh server each time.

## Findings that needed no change

- The survey's "tilted board broken in WebKit" was Playwright's WebKit build only: in the real
  WKWebView on the iPad simulator the board is tilted and its plates sit on their tokens.

## Open, honestly

- **Not verified:** sound actually heard from a TV (the word reaches the TV's page; no ear in the
  simulator); the iOS notification question (it compiles and mirrors Android's, which was run);
  AirPlay or HDMI on hardware, the camera scanners, haptics — as after Stage 700.
- **Android's target SDK stays 36**: `sdkmanager` lists no Android 17 system image to test on.
- **Integration tests (PostgreSQL) were not run here**: another session's database container holds
  the port, and this change touches no server code, migration or package the server builds from.
  CI runs them on the pull request.
- Voice in the apps stops when the app leaves the screen (no background audio mode was added).
- Offered, not chosen: an Android TV app that opens `/display` with a remote and its own sound.
