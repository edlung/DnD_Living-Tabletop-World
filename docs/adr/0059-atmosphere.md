# 0059. Atmosphere: the table's sound and the screen's moments

- Status: Accepted (owner-delegated product decision 2026-11-04; `docs/FULL_GAME_PLAN.md` Stage 690,
  decisions 9 and 11, owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`). Builds on ADR 0040
  (the table's dice and their synthesized sound), 0042 (the table's display and its casts), 0043 (the
  DM's screen) and 0044 (online play: the table's screen on every screen).
- Context: the table hears only the dice. The display shows what the DM casts — a scene, the
  battlefield, the rolls' totals, a title — and cuts from one to the next; a roll shows on the TV only
  in the dice cast, as a number. Decision 9 asks for synthesized ambience and the DM's own music, no
  third-party audio; the plan asks for sound effects, scene transitions, title cards and big dice.

## Decision

1. **Ambience.** Five soundscapes — rain, wind, fire, crowd and night — synthesized in the browser
   from noise, filters and slow modulation, never recorded. The DM chooses one, none, or "by the
   scene" (the default): the place of the scene being played, as each screen's perspective knows
   it, chooses — under a roof (a building or a room), a fire; under rain or a storm, rain; at night,
   night; in a town (a settlement or a district, or a place within one the perspective knows), a
   crowd; anywhere else, the wind. Where the place is comes from what it is, never from how it was:
   knowing the place is enough; the weather is the party's, so it counts once someone of the party
   sees the sky there. It plays on the table's screen and, when the session plays online, on every
   screen; each screen keeps its own volume and its own switch for the table's sound.
2. **Sound effects.** A hit, a miss, a critical hit, a success, a failure, a spell and healing each
   have a short synthesized cue, heard where the roll shows (the table's screen, a player's screen
   whose roll plate shows it), with the dice's sound switch.
3. **The DM's music.** The DM uploads their own tracks (MP3, OGG, M4A or WAV, up to 15 MB each, at
   most 30 a campaign), kept beside the world and private to the campaign: its members and its
   paired displays may play them, nobody else. What a file is, its first bytes say, whatever the
   browser called it. The DM plays one, once or on repeat, pauses, resumes and stops it; it plays
   where the ambience plays, from the same moment (a screen that opens late starts where the track
   is), the ambience quieter beneath it. The table's state keeps when the track started (or where it
   paused), a clock route of its own answers with the server's time (never a watched view: it
   changes every moment), and each screen reads the track's length from
   the sound itself; a screen more than a second off seeks back into step. A screen's audio reads
   the track from this server a range at a time (the page's policy allows no `blob:` media), with
   the session's cookie; a development persona's screen, whose token no audio element sends, reads
   the whole track first. Deleting the track that plays stops the music.
4. **Scene transitions and title cards.** The table's screen fades from one cast to the next; when
   the scene cast's place changes it shows that place's title card — its name, the day and hour, the
   weather — over its picture for a few seconds. The DM's own title cast stays as it is.
5. **Big dice.** A roll the table may see shows big on the table's screen for a few seconds over any
   cast but the battlefield's plate: each die's face, the total, what it was for and its result; the
   dice cast lists the latest rolls with their dice.
6. **Reduced motion and autoplay.** With reduced motion the screen cuts instead of fading and the dice
   do not tumble. A browser plays sound only after a press: a page whose sound waits for one shows
   one "Sound on" — in the world's top bar, and on the table's screen in its quiet corner, which
   stays shown while it waits.
7. **AI on the server.** The VPS's AI keys and spending ceilings stay the owner's to give (decision 11);
   nothing in this stage needs them.

## Consequences

- The table's state gains its sound: the ambience chosen (690a) and the track playing (its ID,
  whether it repeats, when it started or where it paused; 690c) — migration 0037 adds the column,
  beside the world like the table's mode. The tracks are a store of their own (migration 0038), up
  to 450 MB a campaign, kept uncompressed so a range reads alone: the database's backups grow with
  them.
- A scene's presentation says where its place is (`setting`: indoors, town or wild), from what the
  perspective knows of the place and the places it lies in — the sound's only new reading of the
  world.
- Stage 690 runs in parts (`work-orders/STAGE_690.md`): the ambience; the sound effects; the DM's
  music; the screen's transitions, title cards and big dice.

## Invariants affected

None: sound and the screen's moments are presentation beside the world. A roll shows only to those
who may see it (invariant 9), a track only to the campaign's members and displays. A place's setting
names a town only when the perspective knows the town too (a place known alone is "wild").
