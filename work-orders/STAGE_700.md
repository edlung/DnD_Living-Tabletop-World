# Work Order — Stage 700: The players' app and the DM's app

Authority: owner request and answers 2026-11-02 (`reviews/OWNER_NATIVE_APPS_2026-11-02.json`),
program `docs/NATIVE_APPS_PLAN.md`; ADR 0070.

## Deliver

1. **The bridge in the web client** (700a): `apps/web/src/native/` — the shell's presence, its
   features and messages both ways, parsed strictly; the screen kept awake, the alert's vibration and
   the waiting count through the shell; "Scan the code" where a person signs in or joins and "Server"
   in the account menu, in the apps only; the TV panel on the DM's Table screen sheet in LTW DM; the
   table display reporting its code and its pairing to the app that hosts it.
2. **LTW Player for Android** (700b): `apps/android` — the start screen, the server, the QR scanner,
   the game's WebView with the origin-restricted bridge, vibration, the screen awake, local
   notifications, Back to the page first, file choice, links outside, edge-to-edge.
3. **The iOS shell and LTW Player for iPhone and iPad** (700c): `apps/ios` — the shared `LTWShell`
   package and the player's app with the same features in iOS's own terms.
4. **LTW DM for iPad and iPhone** (700d): the DM's app and its TV on an external screen, a window of
   its own with a website data store of its own, and the pairing hand-off.
5. **Art, guide and record** (700e): GPT icons for both apps; the apps' screens in the product's
   colours, fonts and GPT UI-kit art; `docs/NATIVE_APPS_INSTALL.md` for the family's devices; the
   stage report; one pull request and the demo.

## Boundaries

No push service and no third-party SDK (owner's answer); no store publication, developer account,
signing identity or deployment (the owner's); no game logic, cache or world data in the apps; the
browser version behaves as before where no shell is present; no change to the server's policies
(`Permissions-Policy` keeps the page from the camera). An Android DM app is not asked for.

## Checks

- `pnpm run validate` (format, lint, typecheck, context budget with Swift and Kotlin counted, unit,
  build, migrate, seed, integration, browser journeys); new web unit tests and journeys with a
  stand-in shell; the shared case table run by the web, Swift and Kotlin tests.
- Android: `./gradlew test assembleDebug lint` in `apps/android`; the emulator journey (start, the
  server, sign in, the companion, a vibration, the screen awake, Back, a scanned link).
- iOS: `xcodegen generate` leaves the committed project unchanged; `xcodebuild build test` for both
  schemes; the simulator journeys on an iPhone and an iPad; LTW DM with a simulated external display
  pairing its TV.
- An adversarial pass over the bridge, the navigation rules and the TV's data store; a layout pass
  of the apps' own screens and of the client inside them at phone and tablet sizes.

## Final message

`Stage 700 complete: LTW Player (iOS, iPadOS, Android) and LTW DM (iOS, iPadOS) built and verified
on simulators and the emulator — ready for the owner's merge decision.`
