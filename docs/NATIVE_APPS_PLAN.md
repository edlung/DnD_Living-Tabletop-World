# Native apps plan: the players' app and the DM's app (Stage 700)

Owner request 2026-11-02: «Задача - разработать iOS и Android приложение для игроков, чтобы оно
мэтчилось с проектом + iOS и iPadOS приложение для DM.» The owner answered the program's four product
questions the same day, each with the recommended option (`reviews/OWNER_NATIVE_APPS_2026-11-02.json`).
This program supersedes `docs/FULL_GAME_PLAN.md` decision 19 ("native store apps" out of scope) for
the apps below; every other decision of that plan stands, decision 10 (no background push) included.

## What the owner gets

1. **LTW Player** for iPhone, iPad and Android phones and tablets: the player's companion — the
   sheet, dice, inventory, spells, journal, map, the fight, chat — with a QR scanner that joins the
   table, a vibration on an iPhone too, a screen that stays awake through a session, and a local
   notification when the table waits for a player who stepped out of the app for a moment.
2. **LTW DM** for iPad and iPhone: the DM's screen, and the table's screen on a TV connected by
   AirPlay or a cable as a screen of its own — the TV shows only what the party knows while the iPad
   keeps the DM's secrets (plan decision 17 warned that mirroring the iPad shows them).
3. Both look and read as the product does: the game screens are the client the server serves, in its
   visual language and its language of play; the apps' own screens (start, server, scanner) use the
   same colours, fonts and GPT art; the icons are GPT art.

## Decisions (owner-delegated unless marked)

1. **A native shell around the shared client** (owner's answer). The apps are Swift (iOS, iPadOS)
   and Kotlin (Android) programs whose game screens are the web client the chosen server serves,
   loaded from that server's origin. The rules, the knowledge boundary and every screen therefore
   match the browser version and change with the server, never with a store release; nothing of the
   game is computed or stored in the app.
2. **The page and the shell talk through one small bridge** (`docs/adr/0070-native-apps.md`): the
   page may ask for a vibration, the screen kept awake, the count of what waits, the scanner and the
   server's choice; the DM app adds its TV. Only the chosen server's main frame reaches the bridge.
   The browser version is unchanged where no shell is present.
3. **One server at a time.** The apps open `https://ltw.vardahei.tech` (the owner's deployment) unless
   the person chose another — typed, or read from a QR code (Stage 697's local mode shows the
   laptop's address as one). Development builds also open `http://localhost` and `http://127.0.0.1`
   (the server's non-Secure cookie is for loopback only). Anything else opens in the system browser.
4. **The QR scanner is native.** The page's policy denies it the camera (`Permissions-Policy:
camera=()`), and it keeps doing so. The scanner accepts the product's own links — a table link
   (`/table#…`), an invitation (`/join#…`), a reset link (`/reset#…`) or a server's address — and the
   shell opens them in the game; the token in the fragment is never logged, stored or shown.
5. **No push services** (owner's answer). Alerts ring in the open app (sound, vibration, the screen
   awake); while the app is out of view for a short while, a new wait raises a local notification and
   a minute after leaving with something waiting one reminder follows. Notifications say only "The
   table is waiting for you", never what for — a private check must not show on a lock screen. No
   Apple or Google push service, no third-party SDK, analytics or crash reporter.
6. **The DM's TV** is a second, non-interactive window on the external screen (AirPlay or HDMI) that
   opens the table display (`/display`) in a website data store of its own: it holds only the display
   device's cookie, never the DM's session, and reads the PARTY perspective like any paired TV. The
   code it shows reaches the DM's Table screen sheet, where the DM pairs it with one press. Without
   the app nothing changes: TVs pair as before.
7. **Names and identifiers**: "LTW Player" / «LTW Игрок» (`tech.vardahei.ltw.player`) and "LTW DM" /
   «LTW Мастер» (`tech.vardahei.ltw.dm`); the owner may rename them before publishing. iOS and iPadOS
   17 or later (a website data store of its own for the TV needs 17); Android 8.0 (API 26) or later
   with an updated Android System WebView. The player's app runs on iPad and Android tablets too (a
   shared family tablet, plan decision 14).
8. **Distribution** (owner's answer): the family's own devices — Xcode with the owner's Apple ID on
   iPhone and iPad, an APK on Android. The projects carry everything a store needs later except the
   owner's identities (team, certificates, store accounts); publishing is the owner's step.
9. **Tools** (owner's answer): the owner installs Xcode; the session installs JDK 21, the Android SDK
   and an emulator with Homebrew and accepts the Android SDK license for the owner. The Xcode project
   is generated from a checked-in `project.yml` (XcodeGen) and committed, so Xcode opens it as is.
10. **Native code counts like the rest**: Swift and Kotlin files join the context budget (500 lines
    preferred, 700 the ceiling).

## Stage 700

- **700a The bridge in the web client.** `apps/web/src/native/`: the shell's presence and features,
  messages both ways, strict parsing; the screen awake, the alert's vibration, the waiting count,
  the scanner's entry where a person joins or signs in, the server's choice from the account menu
  and the start page, the TV's panel on the DM's Table screen sheet, the table display reporting its
  code and pairing to an app that hosts it. Unit tests, and browser journeys with a stand-in shell.
- **700b LTW Player for Android.** One activity: the start screen, the server, the scanner (CameraX
  with ZXing), the game's WebView with the bridge restricted to the server's origin, vibration, the
  screen awake, local notifications, the system Back closing the topmost sheet, file choice, links
  outside in Custom Tabs, edge-to-edge insets. JVM tests; the emulator journey.
- **700c The iOS shell and LTW Player for iPhone and iPad.** A shared Swift package: the start screen,
  the server, the scanner (AVFoundation), the game's WKWebView with the bridge, haptics, the screen
  awake, local notifications and the badge, links outside in Safari's view, the page's dialogs.
  Tests of the package's logic; the simulator journey on an iPhone and an iPad.
- **700d LTW DM for iPad and iPhone.** The shell as the DM's app; the TV on the external screen with
  its own data store and the pairing hand-off; iPad multitasking. The simulator journey with a
  simulated external display.
- **700e Art, guide and record.** GPT icons for both apps (adaptive layers on Android), the start
  screen's art from the GPT UI kit; the install guide for the family's devices; A-to-Z journeys on
  the simulator and the emulator; the stage's report, the pull request and the demo.

One pull request for the program (`claude/mobile-apps`); it ends with a demo and one question — merge —
since a merge needs the owner's word. Deploying the server that serves the new client is a separate
owner's decision; until then the apps run against a local server and degrade gracefully on the
deployed one (no bridge features in its older client).

## Risks

- **Store review** (later, the owner's): Apple's minimum-functionality rule weighs apps that wrap a
  website; the scanner, haptics, notifications and above all the TV as a second screen are native
  value, and the store notes will say so.
- **WebView differences**: the client was verified on Chromium and WebKit; Android System WebView is
  Chromium and WKWebView is WebKit, so journeys on the emulator and simulator cover the rest.
- **A TV window in the background**: iOS suspends an app out of view, so the TV stops with the DM's
  app; the DM screen says so.
- **Old Android WebViews**: a WebView without the origin-restricted bridge shows "Update Android
  System WebView" instead of running unprotected.
