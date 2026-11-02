# Installing LTW Player and LTW DM on the family's devices

Stage 700 (`docs/NATIVE_APPS_PLAN.md`, ADR 0070). The apps open the server the table plays on and show
its game; everything of the game stays on the server. Store publication is a later step (the end of
this guide).

| App        | Devices                              | Home-screen name           |
| ---------- | ------------------------------------ | -------------------------- |
| LTW Player | iPhone, iPad (iOS 17+), Android 8.0+ | «LTW Игрок» / "LTW Player" |
| LTW DM     | iPad, iPhone (iOS 17+)               | «LTW Мастер» / "LTW DM"    |

## Before the first game: the server

The apps open `https://ltw.vardahei.tech` unless someone chooses another server ("Server…" on the
start screen or under the sign-in form, or by scanning a table's QR code from another server). The
server must run Milestone A (accounts, the table's screen, the DM's screen, the companion) and Stage
700's client (the bridge). The VPS runs Stages 500–540 until the owner deploys; until then the apps
open it but miss those screens and the native features.

## iPhone and iPad (both apps): Xcode

1. Open `apps/ios/LTW.xcodeproj` in Xcode 27.
2. Xcode → Settings → Accounts: add your Apple ID. A free account works; the app then runs for 7 days
   before Xcode has to install it again. The Apple Developer Program ($99 a year) makes it a year and
   adds TestFlight.
3. Copy `apps/ios/Config/Signing.local.xcconfig.example` to `Signing.local.xcconfig` (git ignores it) and
   set your team ID there — or pick the team under each target's Signing & Capabilities.
4. Product → Scheme → Edit Scheme → Run → Build Configuration: **Release** for the family's devices
   (https servers only, no Web Inspector). Debug is for development.
5. Connect the device by cable, choose the scheme (`LTWPlayer` or `LTWDM`) and the device, press Run.
   With a free account, trust the developer once on the device: Settings → General → VPN & Device
   Management.

## Android phones and tablets (LTW Player): an APK

- Quick: `apps/android/app/build/outputs/apk/debug/app-debug.apk` after `./gradlew assembleDebug` in
  `apps/android` (JDK 21, Android SDK). A debug build also opens `http://localhost`; fine for a family,
  but a release build is the one to keep.
- Release (once): create the key and keep it safe — every update must be signed with it.

  ```bash
  keytool -genkeypair -v -keystore ~/ltw-release.jks -alias ltw -keyalg RSA -keysize 4096 -validity 10000
  ```

  Then `apps/android/keystore.properties` (git ignores it): `storeFile=/Users/<you>/ltw-release.jks`,
  `storePassword=…`, `keyAlias=ltw`, `keyPassword=…`, and `./gradlew assembleRelease` gives
  `app/build/outputs/apk/release/app-release.apk`.

- Install: send the APK to the phone and open it (allow installing apps from that source once), or
  `adb install app-release.apk` over USB.

## At the table

- **Joining**: open LTW Player and press "Scan the table's code" — the DM's invitation QR (Players
  sheet) or the table's QR (on the TV). A code of another server asks before switching.
- **Alerts**: the phone vibrates and rings when the table waits for its player, the screen stays on
  during a session, and a phone put away for a moment gets one notification, "The table is waiting
  for you" — never what for. There is no push service: a locked phone learns it when it is opened.
- **The TV with LTW DM**: start AirPlay Screen Mirroring to an Apple TV or an AirPlay TV, or connect a
  USB-C/Lightning to HDMI adapter. The TV shows the table's screen, not the iPad's; open Table screen
  and press "Pair this TV". The TV goes dark while LTW DM is not on the iPad's screen.
- **Android's Back** closes the open sheet first, then puts the app aside; the game keeps its place.

## Privacy

No analytics, crash reporter, advertising or push SDK. The session cookie stays on the device: it is
kept out of iCloud and Google backups and device transfers. Notifications carry no game details.

## Publishing later (the owner's step)

App Store: the Apple Developer Program, App Store Connect records for `tech.vardahei.ltw.player` and
`tech.vardahei.ltw.dm`, a privacy policy URL, screenshots, and review notes that name the native
features (the QR scanner, vibration, notifications, the TV as a second screen). Google Play: a Play
Console account ($25), the release key above (or Play App Signing), the same privacy policy, the data
safety form (no data collected by the app itself). Universal Links and App Links need the team ID
and the key's fingerprint on the server; they are not set up yet.
