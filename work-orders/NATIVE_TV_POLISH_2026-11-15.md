# Work Order — The apps and the table's screen, polished (2026-11-15)

Authority: owner request 2026-11-15 («давай доработаем приложения для iphone, android, ipad и вывод
на телевизор») and the owner's answers the same day to the survey of `main` (`e268e158`): three
packages chosen — the table's screen, the apps, the layout — and the TV's sound in LTW DM "from the
DM's iPad" (it starts by itself; the DM's Table screen sheet holds its switch and volume). An Android
TV app was offered and not chosen. ADR 0042 and ADR 0070 are amended; ADR 0033 §4 gains the retry of
a failed background read.

## Deliver

1. **The table's screen (`/display`).**
   - The waiting strip never covers the turn order: on the battlefield it stands along the bottom,
     everywhere it names at most four waits, the same ones gathered, and the rest as a count.
   - A read that failed in the background is read again (2 s doubling to 30 s) until it answers, so a
     screen that lost its network shows the present once it is back; while the live signal is away
     the screen says so in a small plate.
   - The rolls cast fits one screen: the newest roll large, two before it beside it, the waits capped.
   - Type scales with the screen: the page's root size follows the smaller side from 1080 lines up,
     so a 4K TV shows what a 1080p one does; the battlefield's names and turn line are larger.
   - The quiet corner fades even while sound waits for its press: only "Sound on" stays, alone; it is
     no full-width bar on a narrow screen.
   - A roll without an outcome is heard too (the dice's clatter), with the dice's sound on.
   - "The table could not be reached" tries again by itself.
   - A remote's arrows and OK reach the corner; focus is kept after "Unpair".
   - The scene cast follows a fight: while the party fights, a screen cast to "where the party is"
     shows the battlefield, and the scene again after it. The DM's sheet says so, and says when the
     table's screen cannot see the fight because nobody of the party takes part.
   - A picture cast of something without an approved picture shows its name on a title card.
2. **The apps.**
   - LTW DM's TV: sound runs without a press; the corner shows nothing to press; the Table screen
     sheet's TV panel holds "Sound on the TV" and its volume (bridge: `tv-sound` → `sound`).
   - The table's voice (ADR 0060) in the apps: the microphone, asked for by the page of the chosen
     origin only (iOS usage description and capture decision; Android runtime permission).
   - The workshop in LTW DM: its invitation link opens from the scanner and from a launch link; the
     DM's sign-in and campaign pages offer "Campaign workshop", and the workshop offers the way back.
   - Notifications are asked for when the table first waits for the person, after the app's own
     question. In the apps the join page says "this app", the scanner has a scanner's glyph, and iOS
     describes its use of the local network (ADR 0061).
   - Android's target SDK follows Android 17 once tested on it.
3. **Layout.** The top bar never overlaps itself between 1200 and 1365 px (an iPad or an Android
   tablet held wide); a phone held wide keeps the scene (compact top bar and dock); the tilted board
   is checked in Safari's engine on the iPad simulator and fixed if it is wrong there.

## Boundaries

No push service, no third-party SDK, no store publication, signing identity or deployment; no game
logic or world data in the apps; the browser behaves as before where no shell is present, except the
fixes above; the display stays read-only and reads only the PARTY perspective; no change to the
server's `Permissions-Policy`.

## Checks

`pnpm run validate` steps (format, lint, typecheck, context budget, unit, build, integration,
browser journeys), new unit tests and journeys for what changed; `swift test`, both iOS schemes
built, `./gradlew test assembleDebug lint`; the apps run on the iOS simulators and the Android
emulator; the layout audit at 1440, 768 and 390 px and at TV sizes (960×540, 1920×1080, 3840×2160).

## Final message

`Apps and table screen polished: verified in browsers, on the iOS simulators and the Android
emulator — ready for the owner's merge decision.`
