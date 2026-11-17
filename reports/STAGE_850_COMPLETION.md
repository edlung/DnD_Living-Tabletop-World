# Stage 850 completion — a scene that brings its sound

Pull request: https://github.com/edlung/DnD_Living-Tabletop-World/pull/55 (draft, stacked on
Stage 840's, https://github.com/edlung/DnD_Living-Tabletop-World/pull/53).

Work order `work-orders/STAGE_850.md`; program `docs/TABLE_IDEAS_PLAN.md` (section 850); ADR 0073
§6; 2026-11-16. Status: **AWAITING_OWNER_DISPOSITION**. Branch `claude/stage-850-scene-sound`.
This report carries the program's second checkpoint (Stages 830–850), at its end.

**On whose word.** The owner's, typed on 2026-11-16 in another session and quoted as relayed
(`reviews/OWNER_TABLE_IDEAS_2026-11-16.json`): «приступай к реализации этих улучшений…». Every
design point is the session's and stays the owner's to overrule.

## What changed

- **A place keeps its own sound.** Where the DM chooses a place to show on the table's screens,
  the form has "The sound of {place}": an ambience and one of the DM's own tracks. "Keep this
  sound for the place" keeps it; both left as they are, the same button takes it away.
- **Showing the place switches it on**: the table's sound changes with the cast, in one step on
  the server — the place cannot be shown without its sound, nor sounded without being shown. A
  track starts from its beginning, on repeat. The sheet says what changed ("Showing the place
  changed the table's sound: ambience and music.") and goes on saying it.
- **Nothing else applies it**: not the party's arrival at the place, not a reload. The DM's own
  choice in Session still changes the sound afterwards.
- **The display's "by the scene"** follows the place it shows.
- **Kept beside the world** (`ltw_place_sounds`, migration 0046, additive), the DM's alone to
  set and to read; it moves with a campaign. No AI, no new sound files.
- **Session's decisions**: all of ADR 0073 §6; they are listed in the work order.

## Found and fixed on the way

- **By looking at the screens**: the two fields stood side by side, misaligned and too narrow
  for a track's name on a phone; they start level and stand one under the other now.
- A neighbour journey (`table-display`) reads "the status" of the Table screen sheet: the line
  that says what the sound did is a live line of its own, not a second status.
- The journey raced the form: after "Show on the screens" the form is made anew from what is
  shown, and a place chosen in it meanwhile was undone. The journey waits for the new form.
- The Russian journey opened the sign-in page in an English browser (the sign-in page speaks
  the browser's language).
- The stage's own tests had never run: the track upload in them was a guess, and the invitation
  was for a hero who already had a player. Both are as the music's own tests do it now.
- **From the independent UX, copy and accessibility pass** (a reviewing subagent, reading the
  source): one key had two Russian words («Запомнено» against «Сохранено» for "Kept."), which
  the dictionary's test refuses; "The place's sound is on" was shown for one round trip, because
  the form is made anew with every cast — the sheet says it now, and says what changed; "Kept."
  was wiped by the re-read that followed it; "Where the party is" changed the sound with no word
  of it; while the tracks were still loading the button armed itself and saving would have
  erased the kept track; a deleted track looked like "Leave as it is"; removing a place's sound
  was labelled "Keep…"; «мелодия» where the sound sheet says «трек».

Not taken: Session's line "Now by the scene: …" follows the world's scene while a display
follows the place it shows; with a place shown that the party is not in, the two can name
different ambiences (ADR 0073, Consequences).

## Verification

| Check                                                                                           | Result                                                                                      |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Format, typecheck, context budget                                                               | pass                                                                                        |
| Lint                                                                                            | pass on the files changed since Stage 840; the whole repository is linted by CI             |
| Unit tests                                                                                      | pass — 596 files, 4783 tests                                                                |
| Integration tests (PostgreSQL 16)                                                               | pass — 84 files, 405 tests                                                                  |
| Build                                                                                           | pass                                                                                        |
| Journeys, Chromium: `place-sound` (two), and the neighbours `atmosphere` (two), `table-display` | pass                                                                                        |
| Screens at 1440, 768, 390, 320 and 832×400, English and Russian                                 | looked at, 30 screenshots: the form for "where the party is", a place's sound, a sound kept |
| Independent UX, copy and accessibility pass                                                     | done from the source; findings above, fixed                                                 |

**Adversarial pass against the boundary.** A place's sound is the DM's preparation and names a
place — which may be one the party has not found. The two routes are the DM's alone: a player
is answered as if the routes did not exist, a stranger and a display likewise (unit tests). What
reaches everyone is only the table's sound state that already exists — an ambience's fixed word
and a playing track — and only once the DM shows the place; the cast's answer that says what
changed is the DM's own. A kept sound for a secret place therefore tells the table nothing
until the DM chooses to show that place, and then no more than the DM choosing that ambience by
hand would. A track of another campaign is refused.

## Not verified

- **No sound was heard.** What plays is read from the display's sound element in the journey;
  nobody listened to a television.
- **The whole browser suite was not run on this branch** in this environment; the pull
  request's CI runs it.
- **WebKit**: not installed here. This stage's journey is not in the `ipad` list (it needs a
  paired display and a DM; the form is the DM's).
- A real TV; a screen reader's actual announcements.

## Checkpoint 2 — Stages 830–850

**Done.** Three more stages, each in its own draft pull request, each with its report:

| Stage                                    | Pull request                                                | What it gives                                                            |
| ---------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| 830 The party's encyclopedia             | https://github.com/edlung/DnD_Living-Tabletop-World/pull/52 | "What we know" in the Chronicle, read as the party; no server change     |
| 840 Private notes and a hero's backstory | https://github.com/edlung/DnD_Living-Tabletop-World/pull/53 | the Story tab; migration 0045                                            |
| 850 A scene that brings its sound        | this one                                                    | a place's own ambience and track, switched on when shown; migration 0046 |

**Merge order.** After pull requests 37–44, 46 and 47 (the earlier package): 48 (the plan), 49,
50, 51, 52, 53, this one. Each is stacked on the one before. Migrations in order: 0044 (800),
0045 (840), 0046 (850); each is additive.

**Not verified, across the three.** WebKit locally (CI only); the whole browser suite on these
branches outside CI; real devices and a real television's sound; the family at a real table.

**CI.** Pull requests 48–53 were red today in single journeys. Most were WebKit journeys that differ from run to run (the plan's pull request, documentation only, among them); the base found one cause — the journeys' dev server reloading WebKit pages — and its fix is merged into these branches. One failure was real and this program's own: Stage 810's button lay over a fight's controls on a narrow screen and took their presses (two older Chromium journeys). It is fixed in pull request 50 and merged into 51–53 and this branch. CI runs again on each as this is written.

**Still to come.** Stages 860–890 are written and reviewed in source; each is verified and
opened in turn.

## For the owner

Merge after pull request 53 (Stage 840). Migration 0046 is additive. Only the owner can: merge,
deploy, and hear whether the sound that comes with a place is a help or a surprise.
