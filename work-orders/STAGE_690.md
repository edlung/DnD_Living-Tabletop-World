# Work Order — Stage 690: Atmosphere

Authority: owner approval 2026-11-02 (`reviews/OWNER_FULL_GAME_2026-11-02.json`), program
`docs/FULL_GAME_PLAN.md` (Milestone D, Stage 690); ADR 0059 (written first). Branch
`claude/full-game-d`, on Milestone C.

## Sub-stages (one commit each, the suite green at each)

- 690a — Ambience: rain, wind, fire, crowd and night synthesized in the browser; the DM's choice (one,
  none, or by the scene) kept with the table's state (migration 0037); played on the table's screen
  and, online, on every screen, each with its own volume and mute; "Sound on" where a screen was never
  pressed. Done: by the scene reads the scene's new `setting` (indoors, town, wild: what the
  perspective knows of the place); "Sound on" in the world's top bar and the TV's quiet corner.
- 690b — Sound effects: a hit, a miss, a critical hit, a success, a failure, a spell and healing, where
  the roll shows, with the dice's sound switch. Done on every screen whose dice stage throws the roll
  (a hidden result, such as a check against a DC the player does not know, has no sound); the
  table's screen hears them with its big dice (690d).
- 690c — The DM's music: tracks uploaded, listed, deleted, private to the campaign; played once or on
  repeat, paused, resumed, stopped, in step on every screen that plays the ambience.
- 690d — The screen's moments: fades between casts, the place's title card, big dice over the cast.

## Checks at each sub-stage

Format, lint, typecheck, context budget, unit and integration tests, build; the browser suite for
anything a screen shows; the layout audit (1440, 768, 390, 320; light and dark; RU and EN) for every
new screen, and once with reduced motion. Audio is checked by its graph (what plays, how loud), never
by ear.
