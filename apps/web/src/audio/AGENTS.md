# The table's sound in the client (`src/audio/`, Stage 690)

ADR 0059; work order `work-orders/STAGE_690.md`. Every sound is synthesized here, never recorded; what
the table hears is the DM's choice from the table's state (`GET lobby` → `sound`), played on the table's
screen and, online, on every member's screen.

| File              | Role                                                                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `schedule.ts`     | Pure and seeded: when a raindrop lands, a log crackles, a cricket chirps in a window of seconds                                                                                                                    |
| `soundscapes.ts`  | The five graphs: noise beds (white and seamless brown), filters, and the moments of each window (drops, pops, chirps, a crowd's syllables, the wind's gusts)                                                       |
| `ambience.ts`     | `AmbiencePlayer`: one soundscape at a time, crossfaded, a few seconds of moments ahead, at the screen's volume (half the dice's loudest)                                                                           |
| `cues.ts`         | What came of a roll as a short sound (ADR 0059 §2): `cueFor` (a throw's hit, miss, critical, success, failure, spell or healing, from what the viewer's roll entry says), `VOICES`, `playCue` at the dice's volume |
| `table-sound.tsx` | `TableAmbience` (the choice, by the scene from `entities` → `scenePlaceId` → the scene's `setting`, weather and hour), `useSoundWaiting`, `SoundOnButton` (the world's top bar), the one player a page             |

- Sound runs only after a press (`dice/audio.ts`: `unlockAudio`, `soundOut`, `onSoundChange`): the dice,
  the chime and the ambience share one context and its limiter.
- `div.table-sound` carries `data-ambience` and `data-sound` for tests; it is `hidden`, so it never takes
  a share of a grid's height (the world's column is a one-column grid).
- Each screen's switch and volume live in the viewer's settings (`dice/settings.ts`: `atmosphere`,
  `atmosphereVolume`), set in the Dice sheet's "Sound and motion"; the TV's quiet corner has the switch.
- The dice stage (`dice/dice-stage.tsx`) plays a throw's cue as it lands and marks the plate's line
  with `data-cue`; a result the viewer may not know is not in its roll entry, so it is never heard.
- Tests: `schedule.test.ts`, `ambience.test.ts`, `cues.test.ts` (the graph through a recording
  stand-in for the audio context, `testing/fake-audio.ts`: what plays, when and how loud; never by
  ear); journeys `tests/e2e/atmosphere.spec.ts` (campaign `ui-signin-atmosphere`), `dice.spec.ts` and
  `a-to-z.spec.ts` (the plate's cue).
