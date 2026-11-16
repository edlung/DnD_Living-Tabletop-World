# Work Order — Stage 850: A scene that brings its sound

Authority: the owner's word of 2026-11-16 (`reviews/OWNER_TABLE_IDEAS_2026-11-16.json`, quoted as
relayed) and the standing word to follow a plan without asking, applied by the sessions' reading;
program `docs/TABLE_IDEAS_PLAN.md` (section 850, decision 9); ADR 0073 §6, written with the
stage. Branch `claude/stage-850-scene-sound`, stacked on Stage 840's.

## Deliver

1. **A place's own sound**: an ambience and one of the DM's tracks, kept in the form that shows
   the place on the table's screens.
2. **Showing the place switches them on**, in the table's one sound state; the DM's sound
   controls show and change it afterwards.
3. **The table's display plays "by the scene" for the scene it shows.**

## Session's decisions (the owner asked not to be asked; each may be overruled)

- All of ADR 0073 §6.
- The idea named "a place or a prepared scene": the application has no prepared scene, so a
  place carries the sound. A prepared encounter's own sound is left for later.
- The sound is applied on the server, with the cast, so it cannot be shown without its sound or
  sounded without being shown.
- A place's track plays on repeat: a place's music is a background, not a song.
- Only the DM's showing applies it — never the party's arrival at the place.
- A campaign may give a sound to two hundred places.

- From the independent pass, taken as decisions: the sheet — not the form, which is made anew
  with every cast — says what showing the place did to the sound; the same button removes a
  place's sound when both fields are left as they are, and is named so; a deleted track is said
  to be deleted; "where the party is" says that the party's place may bring its sound.

## Boundaries

No world state, no event, no command. No new sound and no new track: the five soundscapes and
the DM's own uploads (ADR 0059). No AI. No art. Additive migration (0046). Nothing is deployed;
merging is the owner's word.

## Checks

- Unit: the DM keeps a sound and showing the place applies it; a place without one leaves the
  sound alone; a track from its start on repeat, not restarted when shown again; "where the
  party is"; the DM's own choice stands afterwards; a deleted track; taken away when it brings
  nothing; a place only, a track of the campaign's, the fixed words; the DM's alone; the store's
  bound.
- Integration: the store on PostgreSQL against the in-memory one; the move's coverage.
- Journey: `place-sound.spec.ts` with a paired TV — the sound kept, the place shown, the TV's
  ambience, Session's control, the DM's change after, a place without a sound; in Russian.
- A look at the changed screen at 1440, 768, 390, 320 and 832×400 in both languages; an
  independent UX, copy and accessibility pass.
- Format, lint, typecheck, context budget, unit and integration tests, build, the whole e2e
  suite; an adversarial pass recorded in the report.

## Done

`reports/STAGE_850_COMPLETION.md`, status `AWAITING_OWNER_DISPOSITION`, with the second
checkpoint of the program (Stages 830–850); a pull request stacked on Stage 840's.
