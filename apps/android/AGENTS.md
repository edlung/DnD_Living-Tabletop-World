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

- The app computes and stores nothing of the game. `ServerStore` keeps origins only; never log, store
  or show a URL with its fragment (a token rides there). No third-party SDK, analytics or push.
- The bridge exists only for the chosen origin's main frame (`WebViewCompat.addWebMessageListener`
  and `addDocumentStartJavaScript` with that origin's rule); a WebView without them gets the "update
  the WebView" screen, never an unrestricted `addJavascriptInterface`.
- Release builds play on `https` only (`res/xml/network_security_config.xml`); debug builds also on
  `http://localhost` and `http://127.0.0.1` (`src/debug/res/xml/`).
- Pictures are GPT art (the UI kit's key art and emblem, the app icon); code draws only shapes.
- Build: JDK 21 and the Android SDK (`ANDROID_HOME`); `./gradlew test assembleDebug lint`. A release
  key is the owner's: `keystore.properties` (ignored) names it. Debug builds take
  `--es server http://127.0.0.1:<port>` for the emulator's journeys (with `adb reverse`).
- Swift's twin is `../ios`; keep the two shells' behaviour alike.
