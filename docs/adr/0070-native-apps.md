# 0070. Native apps: a shell around the server's client

- Status: Accepted (owner product decisions 2026-11-02 — approach, no push, tools, distribution —
  and owner-delegated decisions of `docs/NATIVE_APPS_PLAN.md`; record
  `reviews/OWNER_NATIVE_APPS_2026-11-02.json`). Supersedes `docs/FULL_GAME_PLAN.md` decision 19 for
  these apps; keeps decision 10 (no background push) and ADR 0036 §7 (credentials). Numbered 0070 so
  the rules program's ADRs (0045 onward, Milestone B) keep their sequence.
- Context: players want an app on their phone and the DM one on the iPad. The game is a web client
  that the server ships with its own version of the contracts, verified on Chromium and WebKit. A
  second implementation of its screens would trail every rule the server gains; a shell around the
  same client keeps one product and adds what only a native app can do.

## Decision

1. **The shell loads the chosen server's client.** LTW Player (iOS, iPadOS, Android) and LTW DM (iOS,
   iPadOS) host one web view each that opens the chosen server's origin — `https://ltw.vardahei.tech`
   unless the person chose another; development builds also open `http://localhost` and
   `http://127.0.0.1` on any port. A navigation stays in the view only within that origin; another
   `http(s)` address opens in the system browser (Safari's view, Custom Tabs); every other scheme is
   refused. New windows follow the same rule. The view keeps no history across launches (Android
   never saves its state; rotation and resizing keep the view) and is inspectable in debug builds
   only. A failed first load shows the shell's own start screen with Retry, the server and the
   scanner. Nothing of the game is computed, cached or stored by the shell.
2. **The bridge** is protocol version 1. At document start the shell installs `window.ltwNative`
   in the server's main frame only — `{ version, platform, app, features, post(message) }`, `app`
   being `player`, `dm` or `tv` — and delivers its own messages as `ltw-native` events on `window`.
   The page sends JSON objects with a `type`: `ready` (its listener is up; the shell answers with
   what it holds), `haptic` (`kind`: `alert`, `dice`), `awake` (`on`), `waiting` (`count`, 0–99),
   `scan`, `server`, `back-result` (`handled`), and from LTW DM's TV window `tv-code` (`code`, eight
   letters and digits as the server makes them), `tv-paired` and `tv-unpaired`; at most 1024
   characters. The shell sends `back` (Android's system Back) and, to the DM's page, `tv` (`state`:
   `absent`, `connected`, `pairing` with `code`, `paired`). The shell accepts a
   message only from the main frame of the chosen origin (iOS: the message's frame and its security
   origin; Android: an origin-restricted web message listener and document-start script, refused
   — "Update Android System WebView" — where the WebView lacks them), parses it strictly, ignores
   what it does not know, and never passes page text into native code paths that act on it. The page
   treats every feature as an enhancement and keeps its browser behaviour when no shell is present.
3. **Credentials and storage.** The session stays the HttpOnly cookie the server sets (ADR 0036 §7),
   held by the web view's cookie store as a browser holds it; the shell never reads it. API answers
   stay `no-store`. The shell stores only the chosen server's origin and the few last ones; no
   token, world data or URL with a fragment reaches its storage, logs or notifications. A scanned
   link is handed to the web view whole, where the client takes the token out of the address as in a
   browser (ADR 0036 §7, ADR 0042 §5).
4. **The scanner** is native (AVFoundation; CameraX with ZXing), because the page's
   `Permissions-Policy` denies it the camera and keeps doing so. It accepts an `http(s)` URL whose
   path is `/table`, `/join` or `/reset` with a fragment, or a bare origin; anything else is "not a
   table's code". A link of the chosen origin opens in the game; another origin asks first ("Connect
   to <host>?") and, confirmed, becomes the chosen server.
5. **Alerts without push.** `haptic` gives a vibration on every device the shell runs on (an iPhone
   too, which the page alone cannot); `awake` keeps the screen on (`isIdleTimerDisabled`,
   `FLAG_KEEP_SCREEN_ON`) while the page asks and the app is in front; `waiting` sets the app's badge
   and, while the app is out of view, a rise raises a local notification. Leaving the app with
   something waiting schedules one reminder a minute later, cancelled on return. A notification says
   "The table is waiting for you" in the device's language and nothing else; tapping it opens the
   app. Permission is asked when a play session first keeps the screen awake. No push service, no
   third-party SDK.
6. **The DM's TV.** In LTW DM an external screen (AirPlay or a cable) gets a non-interactive window
   of its own whose web view opens `/display` of the chosen origin in a website data store of its own
   (`WKWebsiteDataStore(forIdentifier:)`, persistent, separate from the DM's), so it holds only the
   display device's cookie and reads the PARTY perspective as any paired TV (ADR 0042); the external
   screen shows that window instead of mirroring the iPad. The display page reports its code to the
   shell, the shell tells the DM's page, and the Table screen sheet offers "Pair this TV" with the
   code shown — the DM still presses it. Unpairing and casting are the sheet's as before. iOS stops
   an app that leaves the screen, and the TV with it: the sheet says so. LTW DM declares multiple
   scenes (the game window and the TV's). Debug builds launched with `-ltwTvPreview YES` show the TV's
   window in a corner of the device's own screen, so the simulator's journeys exercise the TV where no
   external screen can be attached.
7. **Platform details.** iOS: WKWebView with sound that needs no gesture, inline media, no link
   previews or back-and-forward swipes, the outer scroll without bounce, the page's `alert`,
   `confirm` and `prompt` as native alerts, a reload when the web content process ends, the view
   inside the safe area over the client's ink colour. Android: one activity that handles its own
   configuration changes, edge-to-edge with the view inside the system bars and the keyboard, file
   choice for the page's file inputs, every other permission request denied, Back sent to the page
   first (it closes the topmost sheet as Escape does) and otherwise sending the app to the background,
   no cloud backup or device transfer of its data. iOS keeps WebKit's data out of backups too.
8. **Builds.** `apps/ios` holds `project.yml` (XcodeGen) and the generated project, a Swift package
   `LTWShell` shared by both apps, and the two apps' targets; `apps/android` a Gradle project (wrapper
   committed) with the player's app; `apps/native-shim/ltw-native.js` is the one shim both shells
   inject. No signing identity, team or key is in the repository (a local, ignored xcconfig and
   Gradle properties hold them). Release builds open only `https` origins.
9. **Verification.** The bridge's parsing and the URL rules have one table of cases
   (`apps/native-shim/cases.json`) run by the web, Swift and Kotlin tests; the web's hooks have unit
   tests and browser journeys with a stand-in shell (`tests/e2e/native-shell.spec.ts`); each app is
   built and run on the iOS simulator (iPhone, iPad with the TV preview) and the Android emulator
   against a local server. The shell logs states and hosts only (`tech.vardahei.ltw`), never a URL
   with its fragment.
