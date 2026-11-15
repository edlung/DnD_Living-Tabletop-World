# LTW Player and LTW DM for iPhone and iPad (`apps/ios`)

The players' app and the DM's app (Stage 700c–d, `docs/adr/0070-native-apps.md`): shells around the
client the chosen server serves. Read the ADR first; the bridge's cases are `../native-shim/cases.json`,
its page side `../web/src/native/`.

| Concern                                           | Read first                                                            |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| The project (both apps, the package)              | `project.yml` → `xcodegen generate` → `LTW.xcodeproj` (committed)     |
| Servers, scanned codes, navigation, page messages | `LTWShell/Sources/LTWCore/` (Foundation only); `swift test` on a Mac  |
| The game window: web view, bridge, links, dialogs | `LTWShell/Sources/LTWShell/GameViewController.swift`, `Bridge.swift`  |
| Start screen, server sheet, look                  | `StartView.swift`, `Theme.swift` (the client's tokens, GPT art)       |
| Vibration, screen awake, badge, notifications     | `Alerts.swift`                                                        |
| The QR scanner                                    | `Scanner.swift` (AVFoundation)                                        |
| LTW DM's TV on an external screen                 | `TV.swift` (own website data store, `/display`, the pairing hand-off) |
| App lifecycle, scenes, backups                    | `AppDelegates.swift`; each app's `Info.plist` is generated            |
| The apps themselves                               | `Player/`, `DM/` (entry point, assets, localized names)               |

- The apps compute and store nothing of the game. `ServerStore` keeps origins only; never log, store
  or show a URL with its fragment (a token rides there). `shellLog` logs states and hosts only. No
  third-party SDK, analytics or push. Besides origins, `UserDefaults` holds the TV's data store
  identifier and one flag, `ltw.notifications-declined` ("No, thanks" to the question below).
- The `ltw` message handler hears only the main frame of the chosen origin; the TV's web view has a
  website data store of its own and never holds the DM's cookie.
- Links (`Origins.classify`, the scanner and `-ltwLink` alike): `/table`, and with a 43-character
  token in the fragment `/join`, `/reset` and `/workshop/join`; another server's link asks first.
- The microphone (the table's voice chat, ADR 0060) is granted in `GameViewController` to the main
  frame of the chosen origin only, and only the microphone; iOS then asks the person itself
  (`NSMicrophoneUsageDescription`). The camera is the scanner's alone; the TV's view refuses both.
  `NSLocalNetworkUsageDescription` covers a server on the home network (ADR 0061). Usage texts live
  in `project.yml` (English) and each app's `InfoPlist.strings` (en, ru).
- The TV's sound: the DM's page posts `tv-sound` (`on`, `volume` 0–100; feature `tv-sound`), `TVHub`
  keeps the last value in memory only (void once the server changes) and sends the TV's page `sound`
  — at once, and again whenever that page says `ready`. The TV's window offers `sound`: its media
  start without a tap.
- Notifications are asked for in `Alerts.askToNotify`: the first time `waiting` is above zero while
  the window is in view with nothing over it, the shell's own question first ("Tell you when the
  table waits for you?"), then the system's on "Continue". "No, thanks" sets the flag and is never
  asked again; a permission already given or refused shows nothing.
- Pictures are GPT art (the UI kit's key art and emblem, the app icons); code draws only shapes.
- Debug builds (`LTWAllowsLoopback` YES) also play on `http://localhost` and `http://127.0.0.1`, open the
  Web Inspector, and take launch arguments for the simulator's journeys: `-ltwServer <origin>`,
  `-ltwLink <url>`, and in LTW DM `-ltwTvPreview YES` (the TV's window in a corner of the screen).
- Build with Xcode 27 and XcodeGen; the schemes are `LTWPlayer` and `LTWDM`, for example
  `xcodebuild -scheme LTWDM -destination 'generic/platform=iOS Simulator' build`. Signing is the
  owner's: `Config/Signing.local.xcconfig` (ignored) sets `DEVELOPMENT_TEAM`. Regenerate the project
  after editing `project.yml` and commit both.
- Kotlin's twin is `../android`; keep the two shells' behaviour alike.
