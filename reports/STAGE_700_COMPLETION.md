# Stage 700 completion — the players' app and the DM's app

Work order `work-orders/STAGE_700.md`; program `docs/NATIVE_APPS_PLAN.md`; owner request and answers
`reviews/OWNER_NATIVE_APPS_2026-11-02.json`; ADR 0070; 2026-11-02. Install guide
`docs/NATIVE_APPS_INSTALL.md`.

## What changed

- **The bridge in the web client (700a).** `apps/web/src/native/`: the shell the shim installs is
  read strictly (protocol 1), the shell's messages parsed strictly, and every use is an enhancement
  that does nothing in a browser. The screen kept awake goes through the shell too (held by count);
  the alert's vibration reaches an iPhone; the count of what waits reaches the app's badge and its
  notification; a landed die knocks in the hand when the dice' sound is on; "Scan the table's code"
  and "Server: <host>" appear under the sign-in form and in the hub, in the apps only; Android's
  Back is the page's Escape first; the DM's Table screen sheet gains "The TV of this device" in LTW
  DM, and the table display reports its code and its pairing to the app hosting it. One shim
  (`apps/native-shim/ltw-native.js`) and one table of contract cases (`apps/native-shim/cases.json`)
  serve both shells and all three test suites.
- **LTW Player for Android (700b).** `apps/android`: Kotlin, one activity, AGP 9.5, minSdk 26,
  compile 37, target 36. The game's WebView opens the chosen server; the bridge is an
  origin-restricted message listener and document-start script, and a WebView without them gets the
  "update the WebView" screen; every main-frame navigation stays on the server, other web addresses
  open in Custom Tabs, other schemes are refused. Start screen in the client's look (GPT key art,
  glass panel, GPT emblem, the client's buttons); the server dialog with recent servers; a QR scanner
  (CameraX and ZXing) whose codes open in the game or, from another server, after a question;
  vibration patterns; the screen kept on; a notification when more waits while the app is out of
  view and one reminder a minute after leaving with something waiting; Back to the page first;
  file choice; edge-to-edge; no backup or device transfer; release builds https only.
- **The iOS shell and LTW Player for iPhone and iPad (700c).** `apps/ios`: an XcodeGen project with a
  Swift package `LTWShell` — `LTWCore` (the contract's rules, Foundation only, tested with `swift
test`) and `LTWShell` (the game window's WKWebView and bridge, the start screen and server sheet
  in SwiftUI, the AVFoundation scanner, haptics, the badge and local notifications, Safari's view for
  links outside, the page's dialogs, WebKit's data kept out of backups, logging of states and hosts
  only).
- **LTW DM for iPad and iPhone (700d).** The same shell as the DM's app; an external screen gets a
  non-interactive window whose web view opens `/display` in a website data store of its own, reports
  its code through the shell, and the DM pairs it with one press. Debug builds show that window in a
  corner of the iPad (`-ltwTvPreview YES`), because the simulator cannot attach an external screen
  here.
- **Art, guide and record (700e).** Two GPT app icons (Codex CLI on the owner's ChatGPT
  subscription; originals, prompts and log in `~/Documents/living-tabletop-world-art/
app-icons-2026-11-02/`), the player's on iPhone, iPad and Android (adaptive foreground), the DM's on
  iPhone and iPad; the UI kit's GPT key art, emblem and die glyph for the start screens, launch
  screens and the notification icon. `scripts/native-art/cli.ts` rebuilds every native picture from
  its source byte for byte (checked twice) and writes `apps/native-shim/art.manifest.json`.
- **Supporting changes.** Swift and Kotlin join the context budget (with Gradle's, Kotlin's and
  Xcode's tool state excluded); the sign-in test server's ports can move for device journeys
  (`LTW_UI_SIGN_IN_WEB_PORT`, `LTW_UI_SIGN_IN_API_PORT`; the browser journeys keep 4312/4313);
  ESLint knows the shim; `.gitignore` keeps tool state and the owner's signing files out.

## How it was checked

See "Checks" below for the numbers. Device journeys ran against the invitation-mode test server on
4412/4413 with the Russian Ravenford (the browser journeys' ports untouched):

- **Android emulator (Pixel 8, Android 16, WebView 133, Russian).** Start screen; the client inside
  the shell; `window.ltwNative` read over the WebView's DevTools protocol (v1, android, player, frozen,
  six features); "Scan the table's code" and "Server: 127.0.0.1:4412" in the sign-in page; the server
  dialog opened from the page; a vibration (160–80–160 ms, the app's own) from `haptic`; with the app
  out of view a rise of `waiting` posted "The table is waiting for you" (generic text, public
  visibility), cleared on return; an invitation link opened through the shell's link handling and the
  seat taken (the companion, "Игрок · Бранн Айронвейл"); Back closed the Journal sheet, then sent the
  app to the background; the DM's check request from the iPad reached the player ("Мастер просит:
  Проверка: Внимательность") with a vibration, and the roll landed with a tick; the GPT icon in the
  launcher as «LTW Игрок».
- **iOS simulator, LTW iPhone (iPhone 18 Pro, iOS 27.2, Russian).** Start screen (connecting,
  unreachable with Retry, the scanner and the server), the server sheet with recent servers, the
  client inside the shell after choosing the local server.
- **iOS simulator, LTW iPad (iPad Pro 11-inch M5, iPadOS 27.2).** The DM's invitation opened through
  the shell, the seat taken, the DM's screen in the app («LTW Мастер»); the Table screen sheet's TV
  panel said "connect a TV"; with the TV preview, the TV window showed the table display's pairing
  code from its own data store (no DM session), the code reached the DM's panel, one press paired
  it ("Paired screens: 1 of 4") and the TV window showed the market square to the party; the DM's
  check request reached the Android player.

## Adversarial review

An independent read-only review of the bridge, the navigation rules, storage and the TV found the
origin pinning sound on both platforms (messages only from the chosen origin's main frame,
navigation kept on it through redirects and new windows, other schemes refused) and the browser
unchanged without a shell. Its findings, all fixed:

- **High — the TV kept another campaign.** The TV's data store is per install, so after pairing in
  one campaign it went on showing that campaign's party view while another campaign's sheet said
  "paired". Now the TV reports the campaign it shows; the DM's panel compares it and offers "Show
  this campaign on the TV", which makes the TV forget its pairing and show a new code (browser
  journey `native-shell.spec.ts`).
- **Medium — an out-of-range port crashed Android in a loop** (java.net.URI does not range-check
  ports; the WebView refuses the origin rule). Kotlin now refuses what Swift refuses (ports outside
  1–65535, an empty port, IPv6, a trailing dot), a refused origin rule no longer throws, and the
  shared cases hold these inputs.
- **Medium — the TV's copy and the mirroring warning.** Mirroring shows the iPad again whenever LTW
  DM leaves the screen: the panel now says so, and while a TV is connected the app covers its page
  (GPT key art and emblem) before it leaves, which also keeps it out of the app switcher's snapshot.
- **Medium — Android opened the launching link again** after a recreation or a launch from Recents;
  a link now opens only on a fresh launch and is removed from the activity's intent.
- **Low** — a new page now resets the screen-on hold and starts the count afresh (a reload's first
  count is never news); iOS counts game windows, keeps one background task and a screen-on reason per
  window; Back is numbered and its timer cancelled, so a late answer never decides a later press; a
  server switch resets the TV's state; a notification is withdrawn when nothing waits any more;
  Android's "another server" question shows the whole host; Kotlin refuses trailing junk after a
  message.

## Open, honestly

- **Not verified on hardware or in the simulator:** the real external-screen hand-off (AirPlay
  Screen Mirroring or HDMI) — Xcode 27's Device Hub offers no external display here and
  `simctl io … screenConfig` powers a port iOS does not attach; the camera scanners (no camera in the
  simulator or the headless emulator; Android's decoding is unit-tested with a generated code);
  notification permission prompts and lock-screen notifications on iOS; haptics on real devices.
- **Distribution is the owner's:** a team ID for iPhone and iPad, a release key for Android, store
  accounts. Universal Links and App Links (opening a scanned table link from the system camera
  straight in the app) need those identities on the server.
- **The deployed server** runs Stages 500–540: the apps open it, but its older client has no bridge,
  accounts or the DM's screen until the owner deploys Milestone A and this stage.
- Android's `targetSdk` is 36 (tested on API 36); raise it with a test on Android 17.

## Checks

- Repository: `pnpm run format:check`, `lint` (the whole repository, no warnings), `typecheck`,
  `context-budget` (1,769 files with Swift and Kotlin, none over 500 lines), unit **3,626/3,626**
  (406 files), `build`, integration **369/369** (71 files), browser journeys **246** (Chromium and
  the iPad WebKit project): 244 passed in the full run, two timed out under the machine's load
  (`rest.spec.ts` axe at phone width, `sign-in-tabs.spec.ts`) and passed when run again; the new
  `native-shell.spec.ts` 3/3.
- Native: `swift test` (the shared cases: origins, scans, page messages, navigation, the shell's
  JSON); Android `./gradlew test assembleDebug lint` — 6 unit tests (the shared cases; a generated
  table's QR code read through the scanner's decoder), Android Lint with three deliberate warnings
  (target 36, a heading attribute ignored on API 26–27, App Links without verification until the
  owner's key); both iOS schemes built for the simulator with no warnings (Xcode 27.2);
  `xcodegen generate` reproduces the committed project byte for byte; `scripts/native-art/cli.ts`
  reproduces every native picture byte for byte.
- Layout: the measurable UI audit of the native-only web UI — the sign-in page's scanner and server
  at 1440, 768, 390 and 320 px in Russian and English, the DM's TV panel in Russian at the same
  widths — found no errors or warnings; the apps' own screens were looked at on the devices above
  (a start panel wider than the iPhone's screen and a full-height panel on Android were found and
  fixed).
