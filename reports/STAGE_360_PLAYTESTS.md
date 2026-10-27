# Stage 360 — Playtests

- Date: 2026-10-27 (Europe/Oslo).
- Status: **AI stand-in pass done (a filter, never acceptance); human sessions pending — they are
  the owner's** (`reviews/OWNER_DECISIONS_9_2026-10-15.json`, Q11). No v0.1 tag before them.
- Work order: `work-orders/OPUS_STAGE_360.md`. Gate 06: PASS after remediation and retest
  (`reviews/ASTRA_GATE_06_REPORT.md`).
- Playtest kit for the owner's sessions: [`docs/playtest/`](../docs/playtest/README.md) (consent,
  setup, neutral tasks in Russian, observer guide, session record template).

## AI stand-in pass

### Conditions

- Build: images `ltw-server`/`ltw-proxy:d41a3d79d785` (code of `145af62` on main), deployed as
  production runs it (`deploy/`, Caddy with the local CA, invitation sign-in) on this machine,
  project `ltw-360-standin`, the review campaign «Пропавший караван» seeded fresh.
- Live AI: Sonnet 5.5 on `reasoning`, `npc-dialogue` and `narrative`, through stored operator
  records (approval `stage-360-standin`: $10 stage, day and session; account daily $15) — enabled by
  following `deploy/RUNBOOK.md` §7a, the key only in the server's environment. Spent: **$0.073**.
  Images: the placeholder generator (no image ceiling stored).
- Participants: two fresh agents (Claude Opus 5.5), one DM and one player, each given only its
  Russian task sheet from `docs/playtest/tasks-ru.md`, the invitation link, and a browser
  (Playwright Chromium, its own persistent profile) — no repository, no source, no HTTP tools, no
  help. The DM handed the player's link over through a file.
- Raw notes and every step's accessibility snapshot and screenshot:
  `reports/evidence/stage-360/ai-stand-in/{dm,player}/` (invitation links redacted; the DM's step
  05 screenshot, which showed the player's link, left out).

### Limits (read before the observations)

- They are language models, not people: reading, patience and navigation differ.
- Their browser tool reloaded the page at every step: the live connection closed between steps,
  so the player saw «Мастера нет на связи» while the DM was active, and live updates were seen
  only on the next step. Not a finding.
- The DM's sheet does not ask for an encounter, and the DM did not start one: the player's task 6
  (combat) never came. The DM wrote no Chronicle chapter: the player's Chronicle stayed empty.
  Both are gaps of this pass, not of the build; the owner's sessions should let the DM decide.
- 46 browser calls (DM) and about 75 (player), roughly 20 and 50 minutes.

### Observations (the participants' own reports; interpretation kept apart)

**DM.** Tasks 1, 2, 5, 7 done quickly (sign-in through «Занять место»; «Создать ссылку-
приглашение» in «Игроки»; Tomas's knowledge hidden from Elowen, checked in her view; «Перейти к
дню 2»). Task 3 (create Tomas in words) done with effort; task 4 (find and correct him) only by a
workaround (undo and create again); task 8 (undo) done after guessing that a placeholder picture
blocked it; task 9 (picture) requested, placeholder stripes received. Task 6 (answer for Tomas)
never arose: the player did not approach him. The DM said creation in words and «Кто увидит» felt
like working with a living world; following the player, correcting an NPC and undo felt like
hunting through the interface.

**Player.** Tasks 1, 2, 4 done; 3 with effort (the caravan site is the neighbouring «Неопознанное
место»; boot prints only through «Проверка внимательности»); 5 partly (Mira and Orin «что-то
скрывают», no one pressed further); 6 not reached; 7 found but empty. Free speech in the
conversation felt alive (Mira on the symbol: «Знак любопытный, не спорю…»); «Спросить» answering
with a record card, fixed buttons instead of own words, an empty town, and NPCs repeating the same
advice or re-introducing themselves felt like a database. Verdict in their words: rather hunting
through the interface, with live moments.

### Findings and disposition

Defects found by the pass are triaged in `stage-360-fixes` (bounded remediation with regression
tests; design gaps go to the owner). The table is completed when that work lands.

| ID    | Finding (as reported)                                                                           | Disposition                                     |
| ----- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| SI-P1 | Places and Journal sheet contents absent from the accessibility tree                            | pending triage                                  |
| SI-P2 | Conversation panel crushes a name plate and a hint                                              | pending triage                                  |
| SI-P3 | Enabled «Спросить» answers «Это действие ничего не изменит…»; «Показать улику» gets no reaction | pending triage                                  |
| SI-P4 | Hypothesis list under the panel header; «Сцена» stays pressed in the Chronicle                  | pending triage                                  |
| SI-P5 | «На связи» beside «Мастера нет на связи»                                                        | pending triage                                  |
| SI-P6 | «Неопознанный объект (НПС)» for a person; duplicate «Торговая гильдия»                          | pending triage                                  |
| SI-P7 | First letter of «За пределами этого места» clipped                                              | pending triage                                  |
| SI-D1 | Authoring draft lost on reload                                                                  | pending triage                                  |
| SI-D2 | Full character sheet unavailable in the DM's view                                               | pending triage                                  |
| SI-D3 | Undo blocked by an automatic picture; the offered undo fails                                    | pending triage                                  |
| SI-D4 | Day change not in History                                                                       | pending triage                                  |
| SI-D5 | Duplicate names in topic lists and the journal                                                  | pending triage                                  |
| SI-D6 | Day 2 memories between Day 1 ones                                                               | pending triage                                  |
| SI-D7 | Backdated placement moved the current place                                                     | pending triage                                  |
| SI-D8 | No way to edit an existing NPC                                                                  | pending triage                                  |
| SI-N1 | NPC lines: same advice from several NPCs; Orin re-introduces himself each conversation          | owner (prompt/content quality, Stage 300 scope) |

## Human sessions

Not run. Three to five uncoached sessions in Russian with real people, per `docs/playtest/`, are
the owner's. Their records go to `reports/evidence/stage-360/session-N.md`, their findings to
this report, with the owner's disposition of each; then the release (`docs/RELEASE_CANDIDATE.md`,
`reports/STAGE_250_RELEASE.md`).
