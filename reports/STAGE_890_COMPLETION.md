# Stage 890 completion — "I'll come / I can't" for the next game

Pull request: https://github.com/edlung/DnD_Living-Tabletop-World/pull/60 (draft, stacked on Stage 880's,
https://github.com/edlung/DnD_Living-Tabletop-World/pull/59).

Work order `work-orders/STAGE_890.md`; program `docs/TABLE_IDEAS_PLAN.md` (section 890); ADR 0073
§10; 2026-11-16. Status: **AWAITING_OWNER_DISPOSITION**. Branch
`claude/stage-890-coming-answers`. The last stage of the program: the close is below.

**On whose word.** The owner's, typed on 2026-11-16 in another session and quoted as relayed
(`reviews/OWNER_TABLE_IDEAS_2026-11-16.json`): «приступай к реализации этих улучшений…». Every
design point is the session's and stays the owner's to overrule.

**This stage reverses decision 14 of `docs/MEMORY_RITUAL_PLAN.md`.** That decision — a session's
default, marked (S) there — left answers to the date out of the earlier package. The owner's
word of 2026-11-16 asked for the listed ideas, and this one was on the list. The other half of
that decision stands: no notification, no reminder from the application.

## What changed

- **Two buttons under the date** in a waiting player's lobby: "I'll come" and "I can't". One
  press answers for the player's own hero; the same press again takes the answer back. Under
  them the table's answers in words: who comes, who cannot, who has not said.
- **The DM reads it on the Session sheet**, under the next game's date, hero by hero — and can
  answer for someone who said it aloud (a child without a phone).
- **A changed date asks everyone again.** A date taken away takes the question with it.
- **Kept small.** Two answers and none; no "maybe", no words to type, no count of who missed
  what, no history. "I can't" does not mark a hero absent — that stays the DM's switch on the
  evening. Nothing is sent to anyone: the calendar file is still the only thing that reminds.
- **Table data beside the world** (migration 0048, additive): no event, no world state; it moves
  with a campaign; the privacy notice names it.
- **Session's decisions**: all of ADR 0073 §10 (it amends ADR 0071 §3); listed in the work
  order.

## Found and fixed on the way

- **From the independent UX, copy and accessibility pass** (a reviewing subagent, reading the
  source): "I'll come" was drawn as the main button, so an unanswered question looked answered
  "yes", and a pressed answer differed by colour alone — the two are equal now and the one given
  carries a mark; a line says the answer can be taken back; the Russian lines read right with
  one name («Кто придёт: …»); the DM's hint is tied to the list and says that the DM's answer
  replaces the player's own; on a phone held sideways the list of names gives way to the
  buttons.
- **By looking at the screens**: on a phone held sideways, right after an evening, the question
  waits behind "Stars and wishes" as the date's own line already does — one card over a short
  scene. "Not now" on that card brings both back. Left so, and said here.

## Verification

| Check                                                                                                                                                                                              | Result                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Format, typecheck, context budget                                                                                                                                                                  | pass                                                                            |
| Lint                                                                                                                                                                                               | pass on the files changed since Stage 880; the whole repository is linted by CI |
| Unit tests                                                                                                                                                                                         | pass — 600 files, 4819 tests                                                    |
| Integration tests (PostgreSQL 16)                                                                                                                                                                  | pass — 86 files, 410 tests                                                      |
| Build                                                                                                                                                                                              | pass                                                                            |
| Journeys, Chromium: `coming` (two), `next-game`, `next-game-file`; and, for the merge with `main`, `place-sound`, `story-cast`, `table-display`, `display-room`, `native-polish` — thirteen in all | pass                                                                            |
| The lobby and the Session sheet at 1440, 768, 390, 320 and 832×400, English and Russian                                                                                                            | looked at, 30 screenshots                                                       |
| Independent UX, copy and accessibility pass                                                                                                                                                        | done from the source; findings above, fixed                                     |

These ran on this branch after `main` (the earlier package, merged on 2026-11-16) was merged
into the whole stack, so they also cover the stack as it now stands.

**Adversarial pass against the boundary.** The lobby's answer lists the perspective's own
characters, and an answer rides on that list alone: a character the party has not met is in no
player's answer, with or without an answer of its own, and a player cannot answer for it (403)
— nor learn from the refusal whether it exists (unit test: the refusal for a hidden character
and for another player's hero is the same). A player answers for their own hero only; a display
answers nothing; a stranger to the campaign gets 404. The body takes one of two words or null
and nothing else (400). Without a date there is nothing to answer (422). An answer is not
knowledge and not world state: no event is written, the World Engine reads none of it, and no
AI is called.

## Not verified

- **The whole browser suite was not run on this branch** in this environment; the pull
  request's CI runs it.
- **WebKit**: not installed here. The journey is in the `ipad` list and runs there in CI only.
- Whether the family uses the buttons or keeps saying it in the family chat: theirs to say.

## The program's close — Stages 800–890

**Done.** Ten stages and their plan, each in its own draft pull request, each with its report:

| Stage                                    | Pull request                                                | Migration |
| ---------------------------------------- | ----------------------------------------------------------- | --------- |
| The plan                                 | https://github.com/edlung/DnD_Living-Tabletop-World/pull/48 | —         |
| 800 Client error reports                 | https://github.com/edlung/DnD_Living-Tabletop-World/pull/49 | 0044      |
| 810 A short way to a pause               | https://github.com/edlung/DnD_Living-Tabletop-World/pull/50 | —         |
| 820 "What can I do?"                     | https://github.com/edlung/DnD_Living-Tabletop-World/pull/51 | —         |
| 830 The party's encyclopedia             | https://github.com/edlung/DnD_Living-Tabletop-World/pull/52 | —         |
| 840 Private notes and a hero's backstory | https://github.com/edlung/DnD_Living-Tabletop-World/pull/53 | 0045      |
| 850 A scene that brings its sound        | https://github.com/edlung/DnD_Living-Tabletop-World/pull/55 | 0046      |
| 860 A shorter way in for a guest         | https://github.com/edlung/DnD_Living-Tabletop-World/pull/56 | —         |
| 870 Theatre of the mind on the screen    | https://github.com/edlung/DnD_Living-Tabletop-World/pull/58 | —         |
| 880 Sealed envelopes                     | https://github.com/edlung/DnD_Living-Tabletop-World/pull/59 | 0047      |
| 890 "I'll come / I can't"                | this one                                                    | 0048      |

**Merge order.** The earlier package (pull requests 37–44, 46, 47) and the apps' polish (32) are
in `main` since 2026-11-16, and `main` is merged into every branch here. So: 48, 49, 50, 51, 52,
53, 55, 56, 58, 59, this one — in that order, each into `main` once the one before it is in
(each is stacked on the one before; the plan's pull request points at `main`). Pull request 45
is not this program's and was not looked at. The five migrations are additive and numbered in
the order of the stages.

**Not verified, across the program.**

- WebKit locally: every `ipad` journey ran in CI only.
- The whole browser suite locally on each branch: each stage ran its own journeys and their
  neighbours here; the whole suite ran in each pull request's CI.
- Real devices: an iPhone, an iPad, an Android phone, the native shells, a real television
  across a room and its sound.
- The family at a real table — the playtest is the owner's, and so is every decision marked as
  the session's in the plan and the work orders.
- Nothing was deployed and no server's database was touched.

**CI.** Before `main` was merged in, pull requests 50, 55 and 58 were green on their heads; 49, 51, 52, 53 and 56 were each red in a single WebKit journey — not the same one twice, and each passing in a neighbouring pull request that holds the same code (the last: `evening-ritual` on the iPad in 56, green in 58). Two failures were this program's own and are fixed: Stage 810's button over a fight's controls (pull request 50) and Stage 800's journey racing the page's own reload (pull request 49). One conflict with `main` was real: both changed the form that shows a scene on the screens (Stage 850's sound and the apps' polish); both changes are kept, in pull request 55. As this is written, CI runs once more on every branch with `main` in it; its answer is in each pull request, and a failure that is this program's is fixed there.

## For the owner

Merge after pull request 59 (Stage 880). Migration 0048 is additive. Only the owner can: merge,
deploy, play an evening with the family, and try the apps on the real devices.
