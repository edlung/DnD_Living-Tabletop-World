# Stage 820 completion — "What can I do?"

Pull request: https://github.com/edlung/DnD_Living-Tabletop-World/pull/PRNUM (draft, stacked on
Stage 810's, https://github.com/edlung/DnD_Living-Tabletop-World/pull/50).

Work order `work-orders/STAGE_820.md`; program `docs/TABLE_IDEAS_PLAN.md` (section 820); ADR 0073
§3; 2026-11-16. Status: **AWAITING_OWNER_DISPOSITION**. Branch `claude/stage-820-what-can-i-do`.
This report carries the program's first checkpoint (Stages 800–820), at its end.

**On whose word.** The owner's, typed on 2026-11-16 in another session and quoted as relayed
(`reviews/OWNER_TABLE_IDEAS_2026-11-16.json`): «приступай к реализации этих улучшений…». Every
design point is the session's and stays the owner's to overrule.

## What changed

- **A button "What can I do?"** on a player's own screen while a game plays, beside the way to a
  pause. It opens a short page in plain words.
- **In a fight, on the hero's turn**: what is left — feet of movement, the action, a bonus
  action, the reaction, attacks still held — each marked "You can" or "Used up", with the hero's
  own options as the rules list them now and a caster's spell slots. On another's turn: whose it
  is, that the hero waits, the reaction. Down, fallen, or held by a condition: what that means.
- **Outside a fight**: the place, what a press on the scene does, the places nearby.
- **Always**: "Say it aloud. The DM decides what happens: you are not limited to the buttons."
- **One new thing a view says**: a combatant's view gains `turn` (what is left of its turn) for
  the DM, the character's own player and a commander's player — nobody else. No table, no
  migration, no AI: every line comes from what the server already answers for that character.
- **Session's decisions**: all of ADR 0073 §3; they are listed in the work order.

## Found and fixed on the way

- **By looking at the screens**: over a fight the row of the two quiet buttons covered the turn
  order, and on a tablet the switch between the scene and the battlefield. In a fight the row
  now lies in the fight's own layout (this moves Stage 810's button too); a journey holds that
  the switch, the turn order and the button are each in reach.
- **From the independent UX, copy and accessibility pass** (a reviewing subagent, reading the
  source): the hint offered an action, movement and a reaction to a stunned or paralysed hero,
  which the rules refuse — the view now says `incapacitated` and offers nothing; it said "You
  can" while the game was paused — no hint on a pause; Russian named a button the game does not
  have («Завершить ход» for «Закончить ход»); the dialog was announced twice and its page read
  again on every refresh; focus went to the wrong place after "Open Places"; eight options ran
  together in one line; a non-caster was offered a spell; first aid was said to raise a hero.
- **In Stage 810's journey**, found here and fixed on its branch: its last step expected the
  asker's button back at once, while her own line stands a minute.

## Verification

| Check                                                                                                                 | Result                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Format, typecheck, context budget                                                                                     | pass                                                                                                                   |
| Lint                                                                                                                  | pass on the files changed since Stage 810; the whole repository is linted by CI                                        |
| Unit tests                                                                                                            | pass — 592 files, 4750 tests, before the row moved into the fight's layout; the web, combat and dictionary tests after |
| Integration tests (PostgreSQL 16)                                                                                     | pass — 82 files, 401 tests (the stage adds no table)                                                                   |
| Build                                                                                                                 | pass                                                                                                                   |
| Journeys, Chromium: `turn-hint` (three), and the neighbours `pause`, `pause-words`, `combat-turn`, `combat-lifecycle` | pass                                                                                                                   |
| Screens at 1440, 768, 390, 320 and 832×400, English and Russian                                                       | looked at, 35 screenshots: the row in a fight and outside one, the hint's page on a turn and in a scene                |
| Independent UX, copy and accessibility pass                                                                           | done from the source; findings above, fixed                                                                            |

**Adversarial pass against the boundary.** The new field is a character's own state. It is sent
to the DM, to that character's player and to the player whose character commands a creature;
unit tests hold that a player's view carries no foe's `turn`, and that the party's shared view
and the table's display carry nobody's. The journey reads everything the player's page was sent
during a turn and finds no creature's initiative or armour class and no place she does not know.
The page itself reads only her own sheet, her own options and her own surroundings. What the DM
gains is nothing the rules' refusals did not already tell.

## Not verified

- **The whole browser suite was not run on this branch** in this environment; the pull
  request's CI runs it on both engines.
- **WebKit / the `ipad` project**: not installed here; `turn-hint.spec.ts` is in the `ipad` list
  and runs in CI.
- **A real phone**; a screen reader's actual announcements.
- At 832×400 and 320×568 the row lies, in the fight's column, under the turn tray until the
  page is scrolled — as the turn banner beside it does there.
- A hero who flies, swims or stands up from prone may reach less than the feet the page says
  (ADR 0073, Consequences): the rules still refuse the move.

## Checkpoint 1 — Stages 800–820

**Done.** Three stages, each in its own draft pull request, each with its report:

| Stage                      | Pull request                                                | What it gives                                                        |
| -------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| The plan                   | https://github.com/edlung/DnD_Living-Tabletop-World/pull/48 | `docs/TABLE_IDEAS_PLAN.md`, the owner's word recorded                |
| 800 Client error reports   | https://github.com/edlung/DnD_Living-Tabletop-World/pull/49 | a plain screen instead of a blank one; the DM's list; migration 0044 |
| 810 A short way to a pause | https://github.com/edlung/DnD_Living-Tabletop-World/pull/50 | one press; a card on the DM's screen alone                           |
| 820 "What can I do?"       | this one                                                    | the hint; what is left of a turn in the fight's view                 |

**Merge order.** After pull requests 37–44, 46 and 47 (the earlier package, none merged): 48,
then 49, 50, this one. Each is stacked on the one before; the base's own changes of today (its
CI fixes) are merged into 48–50 and are under this branch.

**Not verified, across the three.** WebKit locally (CI only); the whole browser suite on the
branches of 810 and 820 outside CI (it was run whole for 800: 339 passed, 11 timed out on a
loaded machine and passed when run again); real devices; the family at a real table. CI on 48
and 49 was red today in journeys that reload WebKit pages — the base found the cause (the dev
server's client reloading the page) and fixed it; that fix is merged into these branches, and
their CI runs again.

**Still to come.** Stages 830–890 are written and reviewed in source; each is verified and
opened in turn.

## For the owner

Merge after pull request 50 (Stage 810). No migration. Only the owner can: merge, deploy, and
see whether a child reads the page and finds it true at the real table.
