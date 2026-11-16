# Stage 760 completion — the ritual's checkpoint

Work order `work-orders/STAGE_760.md`; program `docs/MEMORY_RITUAL_PLAN.md` (the last stage of
Part 1); the owner's word of 2026-11-15, «не спрашивай меня, а действуй по плану до конца»
(`reviews/OWNER_MEMORY_RITUAL_2026-11-15.json`); 2026-11-16. Status:
**AWAITING_OWNER_DISPOSITION**. Branch `claude/stage-760-ritual-checkpoint`, stacked on Stage 740's
(PR 41, not merged). Session model: Claude Fable 5.2.

This is where the session stops: the plan puts the family playtest — the owner's — between this
checkpoint and Part 2.

## What Part 1 is, as it stands on this branch

| Stage | What a table gets                                                            | Pull request |
| ----- | ---------------------------------------------------------------------------- | ------------ |
| 710   | An evening closes with its chapter; the next one opens with "Previously…"    | 38           |
| 720   | A star for the table and a wish for the DM at an evening's end               | 39           |
| 730   | The next game's date on every screen, and its calendar file                  | 40           |
| 740   | The table's agreement, the quiet ways to the DM, the DM's guide              | 41           |
| 750   | Not done: the shells hand over the calendar file and print — waits for PR 32 | —            |
| 760   | This checkpoint                                                              | this one     |

Each stands on the one before (the plan is PR 37): merge in that order. Migrations 0040, 0041 and
0042 are additive.

## What the checkpoint did

- **One evening from end to end** — `tests/e2e/ritual-checkpoint.spec.ts`, on Chromium (a laptop)
  and WebKit (an iPad), with the DM, two players and the table's screen: the agreement written,
  shown on the TV, read and understood by both players; a pause asked for quietly; the evening
  closed with its chapter; the TV asking for stars; each player's star and wish; the next date in
  both lobbies; the next evening opened with "Previously…" on the TV, the date for a later day
  still standing; the date on the campaign's card in the DM's list.
- **What each screen was sent**, in that journey: the TV — the chapter and the stars, no wish, no
  list of who agreed, none of the party-forbidden markers of the DM's secrets; a player — their
  own wish and not the other's, no list of who agreed, and not the other player's request for a
  pause.
- **The lobby at its fullest**, audited in both languages at 1440, 768, 390, 320 and 832×400: the
  line, the next game, the agreement's card, the stars card and "Previously…" together.

## Found and fixed by the checkpoint

- **On a phone the full lobby ran off the top of the screen.** Each stage had audited its own card;
  together — five pieces — the column grew from above the dock up under the top bar, and on a
  320×640 phone "I am ready", the date and half of the agreement's card could not be reached. The
  column now stops under the top bar's real height and scrolls there, each card whole, its hidden
  edge faded (`alerts/slot-room.ts`, `styles/rest.css`). This is the one product change of the
  stage.
- **The second of two invitations made in a row** is read from the field after it has changed: the
  journey's own trap, not the product's (the field keeps the first link until the second arrives).

## Verification

Run on the branch on 2026-11-16 (offline; no paid call), after the fix above:

| Check                                                         | Result                                                                                                                                                    |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run format:check`, `lint`, `typecheck`                  | pass                                                                                                                                                      |
| `pnpm run context-budget`                                     | pass; one earlier warning (`scripts/campaign-shared/combat-kit.ts`)                                                                                       |
| `pnpm run test` (unit)                                        | 574 files, 4616 tests pass                                                                                                                                |
| `pnpm run build`                                              | pass                                                                                                                                                      |
| `pnpm run test:integration` (PostgreSQL, throwaway databases) | 80 files, 396 tests pass                                                                                                                                  |
| `pnpm run test:e2e` (the whole suite)                         | 347 pass, 2 fail: `table-display.spec.ts:65` (below) and `voice.spec.ts:77` (below)                                                                       |
| `ui-layout-audit` of the full lobby (a temporary journey)     | no finding at the five sizes in both languages, before and after the fix: the audit's rules did not see the column leave the screen — the screenshots did |

## Adversarial pass over every new read of Stages 710–740

Read again in the code and held by tests named in each stage's report; the checkpoint's journey
adds the last column.

| Read                                         | Who gets what                                                                                 | Held by                                                                                               |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| A session's chapter, `GET …/chronicle`       | The party's chapters to every member and the TV; the DM's view to the DM alone                | `chronicle-routes.test.ts`; the TV's markers in two journeys                                          |
| Memory suggestions of a session              | The DM alone                                                                                  | `chronicle-routes.test.ts`                                                                            |
| `GET …/reflections`                          | Stars to all at the table and the TV; a wish to its author (that character's view) and the DM | `reflection-routes.test.ts`, `reflection-live.test.ts`; both players' browsers here                   |
| The lobby's `nextGame`; the hub's card       | Every member, the TV; the account for its own campaigns                                       | `lobby-routes.test.ts`, `accounts.test.ts`                                                            |
| `GET …/next-game.ics` (campaign and account) | A member; the account for its own campaigns; not the TV, not a stranger                       | `lobby-routes.test.ts`, `accounts.test.ts`, `next-game.test.ts` (the DM's line cannot add a property) |
| `GET …/agreement`                            | The same page to all and the TV; who has agreed to the DM alone                               | `agreement-routes.test.ts`; the TV's and both players' browsers here                                  |
| A request for a pause (the chat's whisper)   | The DM alone                                                                                  | `chat-routes.test.ts`; the other player's browser here                                                |

Looked for and not found: a view that changes for one reader when another writes something
private (a wish alone, an "Understood", a whisper) — the live signal is a fingerprint of what each
reader is sent, so nothing they are not sent can signal them. Nothing in Stages 710–740 writes to
the world except the chapter and the kept moments, which are World Engine commands as before.

Left as designed, for the owner to know: the DM reads every wish and may write a star, a wish or
"Understood" for anyone at the table; a star and the next game's line are free text the whole
table and the TV read; table data of a deleted account stays with the campaign under the
character's name.

## Not verified — what the playtest is for

- **No human has played any of it.** Every check here is a machine's: journeys, audits, two
  independent UX passes by a reviewing agent. Whether children write stars, whether "Previously…"
  read aloud lands, whether the agreement's words suit this family — unknown.
- **No real device.** Not a phone (the calendar's own screen, the on-screen keyboard over a card,
  the scrolling lobby under a thumb), not a TV (4K was a browser window), not the native apps
  (they show no calendar link until Stage 750; everything else is the same web client, not tried
  in a shell here).
- **A screen reader's speech** was not heard; roles, names and contrast were checked by axe and by
  reading the code.
- **A pause mid-game** is three presses deep for a player and reaches the DM as an unread mark in
  Chat. It may be too slow or too quiet at a real table.
- **`voice.spec.ts:77`** fails on this machine in every run (WebRTC stays "connecting"); the pull
  requests' CI decides.
- **One older journey fails in each whole run, a different one each time, and passes when run
  again**: `scene-result-layout.spec.ts:91` in Stage 740's run (a measurement of the scene taken a
  moment early), `table-display.spec.ts:65` in this one (a TV that stayed on its pairing code for
  fifteen seconds after the DM paired it; it passed alone and with the journeys that ran beside
  it). Neither file was changed by these stages, and this machine runs the suite's two workers
  against four servers; but that it is load and not a defect was not proved. The pull requests'
  CI is a second machine's word.
- **Narrated chapters.** The chapter's prose was the local narrator's or the plain record; no paid
  provider was called in any stage.
- Nothing was deployed; no migration was run outside the tests' throwaway databases; the shared
  development database was not touched.

## For the owner

1. **Merge, in order**: PR 37 (the plan) → 38 → 39 → 40 → 41 → this one. Each is stacked on the
   one before; after a merge the next one's base moves to `main` by itself or by one click.
2. **Deploy** when you choose: three additive migrations (0040–0042) run on start as usual; an
   older build leaves their tables alone, so rolling back the build is safe.
3. **The family playtest** — an evening, then a second one a few days later, to see the whole
   loop: write the agreement and read it from the TV; play; end the session with its chapter;
   stars and wishes on the phones; set the next game and press "Add to calendar" on a real phone;
   open the second evening with "Previously…".
4. **Decisions the session made for you** are listed in each stage's report under "Session's
   decisions"; say which to overrule. The ones most worth a look: the agreement's four tones and
   eight "not in this game" lines in Russian; "Unpair the table's screens" no longer ticked at an
   evening's end; a next game's date cleared only by the session that starts within twelve hours
   of it.
5. **Open points left open**: whether "not in this game" should bind the narrator's prose and the
   NPCs' talk when AI is on; a star glyph from the art pipeline; a shorter way to a pause.
6. **Stage 750** (the shells hand over the calendar file and print) starts after PR 32 merges;
   **Part 2** (the book and the gallery, the home between worlds, small comforts) after the
   playtest, re-read first, as the plan says.
