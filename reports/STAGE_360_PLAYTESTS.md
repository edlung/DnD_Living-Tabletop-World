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

Triaged and fixed on branch `stage-360-fixes` (bounded remediation; each fix with a unit or E2E
test), merged into this stage's branch. Design gaps are left for the owner.

| ID    | Finding (as reported)                                                                                         | Disposition                                                                                                                                                                                                                                        |
| ----- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SI-P1 | Places and Journal contents absent from the accessibility tree                                                | Not a defect: both sheets' contents are in the snapshots (`player/shots/07`, `13`)                                                                                                                                                                 |
| SI-P2 | Conversation panel crushes a name plate and a hint                                                            | **Fixed**: with a conversation and a result open, the row stands above the result and the exits move up (`stage.css`); E2E `scene-result-layout.spec.ts`                                                                                           |
| SI-P3 | Enabled «Спросить» answers «Это действие ничего не изменит…»; «Показать улику» gets no reaction               | **Fixed** wording: «Об этом собеседнику нечего добавить.»; after evidence «…Поговорите или спросите снова…» (offering the action stays: ADR 0013 §3, same answer whatever the NPC knows). A spoken reaction to shown evidence: **owner** (feature) |
| SI-P4 | Hypothesis list under the panel header; «Сцена» pressed in the Chronicle                                      | **Fixed** the header ornament overlap (`shell.css`); the pressed «Сцена» is the modal dialog's inert dock, not a defect                                                                                                                            |
| SI-P5 | «На связи» beside «Мастера нет на связи»                                                                      | **Fixed**: the live-updates badge reads «Вживую»                                                                                                                                                                                                   |
| SI-P6 | «Неопознанный объект (НПС)» for a person; duplicate «Торговая гильдия»                                        | **Fixed**: «Незнакомец»/"Stranger"; colliding names get their kind, then a number (`distinctNames`); leads say «Взглянуть»                                                                                                                         |
| SI-P7 | First letter of «За пределами этого места» clipped                                                            | Not reproduced at 390–1440 px (JPEG scaling of the stand-in's screenshot)                                                                                                                                                                          |
| SI-D1 | Authoring draft lost on reload                                                                                | **Fixed** (owner decisions 11): open drafts listed by a DM route and restored on load; cancel stored on the server; «Открытые черновики» list; migration 0013 closes drafts discarded under the old client                                         |
| SI-D2 | Full character sheet unavailable in the DM's view                                                             | **Fixed**: an NPC without a sheet says «Лист персонажа здесь не заведён.» instead of an error; E2E                                                                                                                                                 |
| SI-D3 | Undo blocked by an automatic picture; the offered undo fails                                                  | **Fixed**: image work (never undoable, ADR 0006 §9) is not offered; the history says to reject the picture first. The automatic portrait request stays (design)                                                                                    |
| SI-D4 | Day change not in History                                                                                     | **Fixed** (owner decisions 11): time and weather changes listed in History with the existing safe undo                                                                                                                                             |
| SI-D5 | Duplicate names in topic lists and the journal                                                                | **Fixed** with SI-P6 («Гоблин-налётчик 1/2/3»)                                                                                                                                                                                                     |
| SI-D6 | Day 2 memories between Day 1 ones                                                                             | **Fixed**: the Journal lists events latest first, up to 50                                                                                                                                                                                         |
| SI-D7 | Backdated placement moved the current place                                                                   | **Fixed** (owner decisions 11): the fix that moved the NPC is gone; the warning explains and offers to edit the description; past whereabouts are future work                                                                                      |
| SI-D8 | No way to edit an existing NPC                                                                                | **Fixed** (owner decisions 11): an edit form on the DM's NPC card through preview, who-sees, confirm and undo                                                                                                                                      |
| SI-T1 | Found during triage: at 768–1199 px the open details drawer covers the dock's right part                      | **Fixed**: the drawer ends above the dock; E2E at 768 and 1024 px                                                                                                                                                                                  |
| SI-T2 | Found during review: at 768 px a conversation beside the open drawer runs under it (choices and close hidden) | **Fixed**: the conversation keeps to the stage's free width; E2E at 768 and 1024 px                                                                                                                                                                |
| SI-N1 | NPC lines: same advice from several NPCs; Orin re-introduces himself each conversation                        | **Fixed** (owner decisions 11): NPCs know whether this character met them and what they already told the party; no re-introduction, no denial, no unasked common advice; live check before/after in `reports/evidence/stage-360/npc-lines/`        |

## Owner decisions 11 (2026-10-28)

The owner delegated the open items to the session (`reviews/OWNER_DECISIONS_11_2026-10-28.json`):
G06-client-02 stays as it is (unidentified means unnamed, not invisible; ADR 0027 amendment); the
five others were fixed on `stage-360-decisions`, each reviewed independently with its findings
fixed. The NPC live check spent about $0.063 by calling the provider adapter directly, not through
the stored operator ceilings (an admitted call holds about $2.54, more than a $1 test ceiling
admits); the script stopped itself at $0.40 a run.

## Second AI stand-in pass (after owner decisions 11)

Same conditions as the first pass on build `880bf072f719` (main after pull request 11), with task
sheets aimed at the changed flows (`reports/evidence/stage-360/ai-stand-in-2/`); live Sonnet 5.5
through stored ceilings, spent $0.055.

**Confirmed fixed:** the draft came back after a reload; the NPC edit saved; the day change was
listed in History and undone; Mira and Thorne remembered Elowen and did not contradict themselves.

**Found and fixed** (branch `stage-360-round2`, each with tests and an independent review):

| Finding                                                                                                                                                                | Fix                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The DM's undo of a time change also rolled back the player's later actions with no word to the player (evidence gone, back in the shop)                                | History names a player's action as such and asks the DM to confirm; the player gets «Мастер отменил ваше действие: …» on the next live update, built only from the player's own command (`GET …/undone-actions`, ADR 0033 amendment; live-isolation tests) |
| A DM-created NPC denied his own testimony («сам я его не видел»)                                                                                                       | NPCs may decline but never deny what they know; authoring now proposes an explicit disclosure for every testimony (tells when asked unless the DM says otherwise) and who-sees shows it (ADR 0018, 0020 amendments)                                        |
| «Я уже говорил…» about what was being told for the first time; Orin re-introducing himself on plain talk; «ты» and «вы» mixed                                          | Records shared by the current exchange are not "already told"; an NPC's own earlier replies to this character (non-canonical traces) count as having met; Russian NPCs keep «вы»                                                                           |
| No sign of a restored draft until opening «Добавить в мир»; stale who-sees copy after confirm; «Подтвердить и добавить в мир» for an edit; weather preselected «дождь» | Dock marker; copy by status; «Подтвердить правку»; current weather or «Выберите погоду»                                                                                                                                                                    |
| Untranslated «trade», «longbow attack»; «Показать улику» with the full text as a primary action                                                                        | Typed action labels with a completeness test; show evidence in the conversation options, preselected                                                                                                                                                       |
| «Нечего добавить» when nothing was said                                                                                                                                | «Собеседнику нечего сказать об этом.» unless something was told                                                                                                                                                                                            |

**Reported, not changed (design):** the DM gets no signal when a player approaches an NPC; the DM's
view stays on the market square. The NPC live checks of this round (about $0.035, round 2) again
called the provider adapter directly rather than through the stored ceilings.

## Human sessions

Not run. Three to five uncoached sessions in Russian with real people, per `docs/playtest/`, are
the owner's. Their records go to `reports/evidence/stage-360/session-N.md`, their findings to
this report, with the owner's disposition of each; then the release (`docs/RELEASE_CANDIDATE.md`,
`reports/STAGE_250_RELEASE.md`).
