# salt-meridian, evening 8 «Прорыв Трёх Устьев»: breakthrough simulation and final read

Final independent critic, 2026-11-16. The campaign is judged as it is now, after the round-1 decisions
(`../sm-round1-decisions.md`). Nothing in the campaign was edited.

Files: `sim.py` (rules + one evening), `variants.py` (sensitivity), `sweep.py` (alarm 0–10),
`make_results.py` → `results-tables.md` (every number below; 400 seeded runs per cell; ~3 s total).

## 1. What the simulator models (and where it comes from)

| Rule                                                                                                                                                                                                                                                                                                                                                          | Source                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Strait: lanes С / Ср / В × rows 0–4; small ≤2 cells, big 1; sideways only in rows 0–1; crossing ends the move; chain Ср2→Ср3 only when it lies: 1 big, or 2 small, or big+small bundle; shoal С2→С3 one small per turn at water 2+ (pact 1+), Фома's salt meter once at water 1; row 3 at the start of a caravan move → passed                                | `strait-chart`, scene 2           |
| Turn order: chain → caravan → blockade → water; water 3 / 3 / 2 / 2 / 1 / 1; one extra −1 for ships in row 2 without the signal (once)                                                                                                                                                                                                                        | `strait-chart`, dmNote            |
| Blockade by alarm band (0–2, 3–4, 5–6, 7–8, 9–10), «Распорядок» from turn 2 unless Инна saw the order, journal given → «Сойка»/«Камбала» drift from turn 1; order Тёрн, Сойка, Камбала, Распорядок, флагман; own cell first, big over small, small out of a bundle; patrol leaves with its prize, the flagship takes two and stays; flagship at anchor at 0–6 | dmNote, `strait-chart`            |
| Signal К-Ж, Ж-К, К-Ч: two actions at O3 (two creatures in one round or one in two consecutive rounds), one with the «Ласка» book → Сойка/Камбала/Распорядок drift that turn. Кречет ≤10 HP or 0 → his men lower weapons, Тёрн + flagship drift that turn, reef warriors leave                                                                                 | encounter `objective`/`tactics`   |
| Stopper: 2 actions (1 if Тар is next to the winch; Руся's axe = bonus action); brake = action on J2 every round, holder must be up on J2 at round end; foe at the winch closes the stopper if no hero on feet and no Тар is adjacent                                                                                                                          | encounter `objective`             |
| Тар: AC 12, 22 HP, speed 30, lands at J12, moves after the last hero, holds the brake once the stopper is out, never attacks                                                                                                                                                                                                                                  | encounter `objective`, decision 4 |
| Sentries 2/2/3/3 (idle in round 1 with the chain map), boarder 1, reef warriors 1/1/1/2 only if hostile (start of round 2); Кречет + boarder land at A1–B1 in round 3 (0–4), 2 (5–8), 1 (9–10) and act at once; targets as printed                                                                                                                            | encounter `tactics`/`scaling`     |
| Кречет as printed in `maps.html`: AC 13, 67 HP, one attack +5 1d12+3. **Reckless is not printed**, so the baseline leaves it out; the SRD berserker's Reckless is a separate variant                                                                                                                                                                          | rendered `maps.html`              |
| End after the turn in which all five are resolved or after turn 6; 4–5 Коридор, 2–3 Половина, 0–1 Закрыт                                                                                                                                                                                                                                                      | scene 3, `world.endings`          |

Abstractions, measured on the printed 18×12 map: J12 → next to the winch 9 squares (bridge K, no
difficult terrain), → mast 8–10, winch ↔ mast 4, A1–B1 → next to I2 6, → next to J2 7 (so Кречет cannot
hit the brake holder in the round he lands). No opportunity attacks, body-blocking or shoving. Fallen
heroes are «оглушены»: no death saves; Healing Word (1d4+3) brings them back.

**Heroes** as given (fighter 31/11 +5 1d8+3; rogue 24/13 +5 1d8+3 +2d6 sneak; cleric 24/11 staff +3
1d6+1, Healing Word ×4; wizard 20/12 staff +1, Misty Step ×2). Seats 5–8 follow `cast.json`: Руся
fighter, Ник rogue, Ася cleric, Денис wizard. Level-3 class features (Cunning Action, Action Surge,
Second Wind) are on in the baseline and off in a variant.

**Table policy (sensible greedy).** Round 1: everyone heads for the winch. The mast team goes to O3:
the wizard, plus Ник (or Василиса at 5 players) when there is no book. The wizard Misty-Steps, the rogue
dashes with Cunning Action. Knock the stopper as soon as anyone is at the winch. Тар holds; the
backup holder (Прохор first) takes J2 only when Тар cannot. Василиса heals Тар first, then fallen
heroes. Everyone else focuses Кречет once he lands (variant: boarder and sentries first). Ships:
bigs go to Ср2; smalls wait in row 1 (row 2 once the signal is up); the С lane is kept for two smalls
while the shoal will be open. **wait**: cross only when nothing would be taken, until a forward check
shows the remaining ships could no longer all cross by turn 6; then cross the most. **rush**: each
turn, cross the set with the most ships passing (crossing minus taken).

**Starting states** (skeleton §2.6, as the campaign prints them). Quiet: alarm 0, journal shown to
Инна, pact, chain map, book. Average: 5, shown, neutral, map, alphabet only. Loud: 8, nothing shown
(«Распорядок» from turn 2), hostile reef, map, alphabet only, «Ласка» as a caravan token.

## 2. Results (main grid; full grid and extra columns in `results-tables.md`)

| Table     | Players   | wait: Коридор/Половина/Закрыт %, passed mean (p10–p90) | rush: same             | Кречет out @ round (wait) | signal @ round         |
| --------- | --------- | ------------------------------------------------------ | ---------------------- | ------------------------- | ---------------------- |
| quiet 0   | 5         | 99/1/0, 4.25 (4–5)                                     | 100/0/0, 4.00 (4–4)    | 78 % @ 4.7                | — (no patrol it stops) |
| quiet 0   | 6 / 7 / 8 | 100/0/0, 4.54 / 4.57 / 4.61 (4–5)                      | 100/0/0, 4.00          | 95–98 % @ 4.3–4.4         | —                      |
| average 5 | 5         | 100/0/0, 4.66 (4–5)                                    | 100/0/0, 4.00          | 96 % @ 4.2                | 100 % @ 2              |
| average 5 | 6 / 7 / 8 | 100/0/0, 4.95–4.98 (5–5)                               | 100/0/0, 4.00–4.01     | 100 % @ 3.4–3.6           | 100 % @ 1              |
| loud 8    | 5         | 75/25/0, 4.45 (3–5)                                    | 74/26/0, 3.74 (3–4)    | 98 % @ 4.1                | 100 % @ 2              |
| loud 8    | 6 / 7 / 8 | 95–98/2–5/0, 4.88–4.96 (5–5)                           | 94–98/2–6/0, 3.96–3.99 | 100 % @ 3.4–3.6           | 100 % @ 1              |

- **Hero lost or taken:** 0 % forced. A hero holds the brake in the last turn in 0–11 % of runs (highest
  at 5 players). Тар always takes over («Отдай…»), so staying is only ever a consent question.
  All heroes out: 0 % in every cell. Some hero falls at least once in 1–15 % of runs; Тар falls in
  2–24 %.
- **Decisions per round:** 8.4 (5 players) to 12.4 (8 players): one per active hero plus the fleet
  tokens. On average the breakthrough lasts 4.0–5.1 rounds; the six-round cap is rarely reached.

**Alarm sweep, 6 players, wait + focus:** alarm 0–6 → 100 % Коридор; 7–8 → 92–93 %; 9–10 → 96–98 %.
Only a table that never sends anyone to the mast drops: 0–2 → about 50 % Коридор, 3–8 → Половина,
some Закрыт. Only a weak table (rush, adds first, no class features) at 9–10 reaches 78–80 % Закрыт.

## 3. What decides the outcome

1. **Кречет's surrender.** 4–6 heroes deal about 30–45 damage per round to AC 13. He reaches 10 HP in
   round 3.4–3.6 after landing in round 2 (4.3 after landing in round 3). In the same turn this stops
   «Тёрн» and the flagship and silences the rock, before the flagship's turn 4 at 7–8.
2. **The signal.** Тар recites the pairs without a roll, so the alphabet is never missing. Misty Step and
   Cunning Action put two heroes at O3 in round 1 (round 2 without class features). Every patrol it
   stops drifts before the first ship can reach the line: the first small could cross in turn 2, the
   first big in turn 3.
3. **Holding in row 2** costs at most one water step, and the shoal at water 1 still works with the pact
   or the salt meter. So «держать в ряду 2, пока не сдался Кречет» turns 4 into 5. The text offers this
   choice itself, but it makes 5/5 the norm.
4. Nothing else moves the result by more than a few points: the chain map, the book, reef hostility, the
   journal given to Инна, 5 versus 8 players beyond 5, or any of the readings in §5.

## 4. Exploits and dead states

- **Signal in round 1** (Misty Step / Cunning dash to O3): every signal patrol drifts before turn 2.
  It is legal and decisive.
- **Holding ships back until Кречет surrenders**: legal; turns Коридор-4 into Коридор-5.
- **Killing Кречет early**: dogpiling him is the dominant strategy. Clearing the adds first costs
  0.3–0.8 ships at the loud table (56/44 instead of 95/5).
- **Misty Step to the brake**: unnecessary. Тар holds, and the backup holder is already at the winch.
- **Raising the signal at alarm 0–2** to dodge the extra water drop (handout reading): free.
- **Body-blocking J2** (5 open neighbours if the I1–J1 basket squares are impassable): possible at
  6+ players, not needed. Not simulated.
- **Dead states:** none at alarms 0 / 5 / 8. «All heroes out» never happens. If it did, the text lets Тар
  hold «до конца» with no one attacking him: odd, but it still resolves. At 9–10 under the reading
  where «Сойка» aground keeps taking ships every turn, a table without the signal passes 0 ships.

## 5. Ambiguities (both readings simulated; the effect is at most ±5 points unless noted)

| #   | Where                                                                                                                        | Reading A (baseline) / Reading B                                        | Effect                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | `strait-chart` «кончил ход в ряду 2 без сигнала» vs dmNote «Суда стояли в ряду 2…» vs decision 15 («keeping ships in row 2») | any ship ending a move in row 2 / only a ship that stayed there         | Under A every quiet table (no signal needed at 0–2) loses a water step in turn 2 (100 %), because big ships must end a move in row 2. μ changes ≤ 0.05 |
| A2  | encounter + dmNote: a patrol arriving after the signal (Камбала turn 2/3, Распорядок turn 2)                                 | flags still up → it drifts on arrival / it must be signalled again      | ≤ 2 points                                                                                                                                             |
| A3  | Тар falls on J2                                                                                                              | the replacement stands on J2 / must drag Тар off first (one action)     | ≤ 2 points                                                                                                                                             |
| A4  | dmNote 9–10: «Сойка» aground «с мели не уходит» vs «патруль уходит с добычей»; «Камбала» has no start turn                   | takes once and stays / takes and leaves / takes every turn              | Matters only without the signal: 1.97 → 0.00 passed                                                                                                    |
| A5  | «нужно два (можно двумя существами за раунд)»                                                                                | one creature may give the 2 actions over two rounds (as for the signal) | none                                                                                                                                                   |
| A6  | Тар «своим ходом»                                                                                                            | moves 30 ft / dashes                                                    | ≤ 1 point                                                                                                                                              |
| A7  | Who Кречет and the boarder hit when nobody holds; whether «ни Тара» means Тар on his feet                                    | random hero at the winch; Тар on his feet                               | none seen                                                                                                                                              |
| A8  | evening 2 dmNote + consequence[1] say «двое рифовых воинов»; the package says 1/1/1/2                                        | package / two                                                           | ≤ 1 point                                                                                                                                              |
| A9  | Reckless: the SRD berserker has it, the printed line does not                                                                | off / on                                                                | On: makes him softer still (loud 6p 95 → 100 % Коридор)                                                                                                |

## 6. Final read (task 2)

- **Runnable from text + handouts:** yes. The DM needs `session-8.html` (structure, alarm row, rulings
  box) plus the «Цепной Камень» card in `maps.html` (stopper/brake/signal, Тар's block, the package)
  plus `strait-chart`. Two-layer rounds, token moves, blockade order and the end are all stated. The
  calls a DM must make are A1–A8 above, all small. None blocks play.
- **Round-1 decisions spot-checked (20 of 22):** OK: 1 (except A8), 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
  13, 14, 15 (but see A1), 16, 17, 18, 19 (24/24 scenes have «судовая работа»; Денис has the fog in
  evenings 2 and 7), 20, 21, 22. Grep for «тихая сторона», «отлив тянет», «кого сажать», «до трёх»,
  «пистол», skeleton § references: none left.
- **NPC knowledge start-only:** all nine `knows` lists hold only what the NPC knows on day 1. Filat has
  no «Пескарь» item.
- **Maps vs text:** dock `knot-pier` heroes R3–R8 (east), guards column A (west), crates and the N4 brine
  as printed. Ship-deck `pennants-alongside`/`laska-boarding` heroes column A (west), foes column R
  (east), mast J5, rails and difficult squares match. Reef `chain-rock-battle`/`reef-lanterns` heroes
  row 12 (south), foes row 1 (north). Water rows 6–8, bridges K/L (O/Q for reef-lanterns), boulders L4/O4
  match. Minor: the chain-rock map draws all foes, Кречет included, on G1–K1 (I1–J1 is the basket); the
  text acknowledges the engine and tells the DM to hold Кречет, the boarder and the reef warriors off the
  field.
- **Player pages:** `players.html` and the four handouts have no spoilers (no Кречет, Тар, journal,
  evening order or salt trade). «Рисовал для А. К.» on `rock-sketch` is the intended clue. Small slip:
  `rock-sketch` «Караул: двое у ворота», but 7–8-player tables face three sentries.
- **Banned procedures:** no inventory, no departures in parties, no rescue work at Чаша in evening 4, no
  old endings, no ship-fate reckoning, no epilogue round («Круга эпилогов нет»), no «каждый
  называет», no «общий разбор».

## 7. Findings, smallest fixes

1. **High (design): the alarm barely matters in the finale.** At 6–8 players a sensible table gets
   Коридор 92–100 % at every alarm 0–10 and 5/5 most of the time. «Пролив закрыт» happens only when
   the table ignores the mast. Cause: `encounters.json` `chain-rock-battle.tactics` / dmNote: Кречет's
   surrender drifts «Тёрн» **and the flagship** in the same turn, and he reaches it by round 3–4.
   Smallest fix (one sentence, fits the fiction: at 7+ «его ведёт старпом»): _«При тревоге 7+ сдача
   Кречета флагман не останавливает: старпом держит блокаду до конца прорыва»_. Simulated: 0–6
   unchanged; 7–8 → 44–49 % Коридор / 50–56 % Половина; 9–10 → 100 % Половина. Alternative: drift one
   turn after the signal and the surrender (loud 52/48).
2. **Medium: two wordings of the water rule (A1).** `strait-chart` should match the dmNote: _«стоял в
   ряду 2 весь ход (начал и кончил его там) без сигнала — вода падает на 1 сверх срока (раз за
   прорыв)»_.
3. **Low: reef warrior count.** `sessions-1.json` evening 2 dmNote («двое поднимутся») and
   consequences[1] («двое рифовых воинов»): replace with «рифовые воины по пакету (1/1/1/2)».
4. **Low: late patrols and «Сойка» aground (A2, A4).** Add to the dmNote: _«Флаги висят, пока их не
   сорвали: пришедший позже патруль ложится в дрейф в свой первый ход. Севшая «Сойка» берёт одно
   судно и остаётся на мели без дела; «Камбала» при 9–10 — с хода 1»_.
5. **Low:** `rock-sketch` «двое у ворота» → «двое-трое у ворота». Optionally print Reckless (or «без
   безрассудства») on Кречет's line, so the engine and the table agree.

## 8. Verdict

Yes. A DM could run all eight evenings next week as written. Evening 8 plays from the page,
handout and encounter card with only small rulings, and nothing dead-ends. Before play, apply the
one-line flagship fix (finding 1) if the eight evenings of alarm should change the finale. Without
it, the climax is tense on the rock but nearly always ends in «Коридор».
