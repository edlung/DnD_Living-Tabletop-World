# LTW Player for Android (`apps/android`)

The players' app for Android phones and tablets (Stage 700b, `docs/adr/0070-native-apps.md`): a shell
around the client the chosen server serves. Read the ADR first; the bridge's cases are
`../native-shim/cases.json`, its page side `../web/src/native/`.

| Concern                                       | Read first                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| The activity: start screen, links, Back       | `app/src/main/java/tech/vardahei/ltw/player/MainActivity.kt`             |
| The WebView, its navigation rules, the bridge | `Game.kt` (origin-restricted listener and document-start shim)           |
| Servers, scanned codes, navigation decisions  | `Origins.kt`, `ServerStore.kt`; tests `app/src/test/…/ContractTest.kt`   |
| The page's messages                           | `PageMessage.kt` (strict; the shared cases)                              |
| Vibration, notifications, the reminder        | `Alerts.kt`                                                              |
| The QR scanner                                | `ScanActivity.kt` (CameraX, ZXing)                                       |
| The two questions (server, another server)    | `Dialogs.kt`, `res/layout/dialog_server.xml`                             |
| Look                                          | `res/values/colors.xml` (the client's tokens), `themes.xml`, `drawable/` |

- The app computes and stores nothing of the game. `ServerStore` keeps origins and one flag,
  `notifications-declined`; never log, store or show a URL with its fragment (a token rides there).
  No third-party SDK, analytics or push.
- Links (`Origins.classify`; the scanner, the manifest's intent filter and `--es link` alike):
  `/table`, and with a 43-character token in the fragment `/join`, `/reset` and `/workshop/join`;
  another server's link asks first.
- The microphone (the table's voice chat, ADR 0060): `Game` answers a page's permission request only
  when it asks for exactly `RESOURCE_AUDIO_CAPTURE` from the chosen origin; `MainActivity` asks
  Android for `RECORD_AUDIO` when it is not given yet, and the request is granted or denied by the
  answer. A request withdrawn, replaced or left behind by a closing activity is denied, never left
  waiting. The camera, MIDI, protected media and location stay refused.
- `tv-sound` (LTW DM's page sets its TV's sound) is parsed as on iOS and ignored: this app has no TV.
- Notifications (`POST_NOTIFICATIONS`, Android 13 and later) are asked for in
  `MainActivity.askToNotify`: the first time `waiting` is above zero while the app is in view, the
  shell's own question first (`Dialogs.askToNotify`), then the system's on "Continue". "No, thanks", or
  the system's question refused, sets the flag and is never asked again; a permission already given
  or refused shows nothing.
- The bridge exists only for the chosen origin's main frame (`WebViewCompat.addWebMessageListener`
  and `addDocumentStartJavaScript` with that origin's rule); a WebView without them gets the "update
  the WebView" screen, never an unrestricted `addJavascriptInterface`.
- Release builds play on `https` only (`res/xml/network_security_config.xml`); debug builds also on
  `http://localhost` and `http://127.0.0.1` (`src/debug/res/xml/`). A server off `vardahei.tech`
  (the DM's laptop, ADR 0061 §3) may be trusted through a CA certificate the owner installed on the
  device; `vardahei.tech` only through the system's roots. Keep both files' trust rules alike.
- Pictures are GPT art (the UI kit's key art and emblem, the app icon); code draws only shapes.
- Build: JDK 21 and the Android SDK (`ANDROID_HOME`); `./gradlew test assembleDebug lint`. A release
  key is the owner's: `keystore.properties` (ignored) names it. Debug builds take
  `--es server http://127.0.0.1:<port>` for the emulator's journeys (with `adb reverse`).
- Swift's twin is `../ios`; keep the two shells' behaviour alike.
