# ember-crown: gate battle rerun on the edited text (commit 6787562f)

Date: 2026-11-16. I re-read the edited `source/*.json`:

- encounter `battle-for-the-gate`, handouts `battle-card` and `battle-dm-card`, item `grey-hammer`;
- evenings 6–8, `world.scaling` and `world.endings`, NPC `knows` (Эрдик, Сайр);
- the rendered `session-8.html`, `maps.html` and the handout pages.

The simulator (`gate_sim.py`) now runs the rules as written. The runner is `final_rerun.py`; data is in `final_rerun.json`. Every cell has 400 runs, over 3 tables × 6/7/8 players at the printed dawn and at Ворота 0. Policy and dawn states are as in `results.md`, plus three changes:

- the «ворота» table has stretcher-bearers (rule r, its column left);
- the table shouts «В ворота!» as soon as the arch is empty;
- a non-allied table drops the portcullis at the first legal moment.

## Text as written vs the simulated V1 + r: differences

1. **Neighbours need the horn.** «без сигнала — сами в раунде 6» is gone, and the text gives no arrival without a signal; the V1 + r simulation brought them in round 3 with no signal. They now come at the start of the round after the horn, not before round 3. I now require the horn; the table blows it in round 2, so the timing is unchanged.
2. **«Впустить» is kept.** Once let in, the neighbours hold the arch and stop taking foes; Сайр cannot leave through the arch. This was already in the simulator. The text does **not** say whether the refill continues after «В ворота!». The previous text said «Пришли: доливки нет», and the new text says «доливка идёт» only for neighbours outside the arch. I simulated both readings (T and T2).
3. **Сайр steps onto the stair.** The text says «Сайр встаёт на неё, сдвинув лежащего на соседнюю свободную клетку». The simulator had him raise the banner from the next cell. It now requires him to reach the stair cell itself and a free cell for the hero he moves.
4. **Not simulation-relevant:** scene 2 is now rounds 1–3 and scene 3 is round 4 onward; timing is 20/60/40/20; the DM card's round order is shorter but identical.
5. **Everything else matches V1 + r word for word:** a, b, c, d, f, g, j, n, m, r, the refill example, the duration claim, and the evening 7 consequence «носильщики даже при Рынке 0».

## Results: text as written (T)

| Стол       | Ворота | Игр. | Победа % | цена                       | Уход % | Пощада % | Раунды ср. (p10–p90) | Герой упал % | Доливка арка / P7 % | Залп задел % | Соседи сняли % | Конец: срыв / упал / встало / отход-сдача |
| ---------- | ------ | ---- | -------- | -------------------------- | ------ | -------- | -------------------- | ------------ | ------------------- | ------------ | -------------- | ----------------------------------------- |
| понемногу  | 3      | 6    | 83.2     | Рабочие Журны 83           | 16.8   | 0.0      | 4.4 (4–5)            | 85           | 82 / 0              | 0            | 100            | 40 / 41 / 17 / 2                          |
| понемногу  | 3      | 7    | 94.8     | Рабочие Журны 95           | 5.2    | 0.0      | 4.22 (4–5)           | 73           | 93 / 0              | 0            | 100            | 47 / 47 / 5 / 0                           |
| понемногу  | 3      | 8    | 94.0     | Рабочие Журны 93, Соседи 1 | 6.0    | 0.0      | 4.09 (4–5)           | 70           | 96 / 0              | 0            | 100            | 45 / 48 / 6 / 1                           |
| понемногу  | 0      | 6    | 84.2     | Рабочие Журны 84           | 15.8   | 0.0      | 4.2 (3–5)            | 81           | 86 / 0              | 0            | 100            | 46 / 37 / 16 / 1                          |
| понемногу  | 0      | 7    | 92.2     | Рабочие Журны 92           | 7.8    | 0.0      | 4.13 (3–5)           | 76           | 89 / 0              | 0            | 100            | 46 / 46 / 8 / 1                           |
| понемногу  | 0      | 8    | 94.8     | Рабочие Журны 94, Соседи 0 | 5.2    | 0.0      | 3.98 (3–5)           | 72           | 94 / 0              | 0            | 100            | 47 / 48 / 5 / 0                           |
| ворота     | 4      | 6    | 77.0     | Рабочие Журны 77           | 23.0   | 0.0      | 4.11 (4–5)           | 95           | 40 / 99             | 100          | 100            | 41 / 36 / 23 / 0                          |
| ворота     | 4      | 7    | 90.2     | Рабочие Журны 90, Соседи 0 | 9.8    | 0.0      | 4.1 (4–5)            | 94           | 41 / 100            | 100          | 100            | 43 / 46 / 10 / 1                          |
| ворота     | 4      | 8    | 94.0     | Рабочие Журны 94, Соседи 0 | 6.0    | 0.0      | 3.93 (3–5)           | 91           | 49 / 100            | 100          | 100            | 40 / 54 / 6 / 0                           |
| ворота     | 0      | 6    | 78.5     | Рабочие Журны 78           | 21.5   | 0.0      | 4.12 (3–5)           | 95           | 93 / 90             | 100          | 100            | 40 / 38 / 22 / 0                          |
| ворота     | 0      | 7    | 88.2     | Рабочие Журны 88           | 11.8   | 0.0      | 4.12 (3–5)           | 92           | 94 / 88             | 100          | 100            | 43 / 45 / 12 / 0                          |
| ворота     | 0      | 8    | 91.2     | Рабочие Журны 91           | 8.8    | 0.0      | 3.91 (3–5)           | 89           | 95 / 80             | 100          | 100            | 42 / 49 / 9 / 0                           |
| бросил низ | 4      | 6    | 67.0     | Отданный квартал 67        | 0.0    | 33.0     | 4.22 (4–5)           | 98           | 16 / 88             | 100          | 0              | 45 / 22 / 33 / 0                          |
| бросил низ | 4      | 7    | 87.5     | Отданный квартал 88        | 0.0    | 12.5     | 4.2 (4–5)            | 99           | 20 / 91             | 100          | 0              | 49 / 38 / 12 / 1                          |
| бросил низ | 4      | 8    | 87.2     | Отданный квартал 87        | 0.0    | 12.8     | 4.08 (3–5)           | 96           | 31 / 98             | 100          | 0              | 48 / 39 / 13 / 0                          |
| бросил низ | 0      | 6    | 59.5     | Отданный квартал 60        | 0.0    | 40.5     | 4.26 (4–5)           | 98           | 86 / 8              | 100          | 0              | 40 / 18 / 40 / 2                          |
| бросил низ | 0      | 7    | 84.5     | Отданный квартал 84        | 0.0    | 15.5     | 4.27 (4–5)           | 98           | 92 / 10             | 100          | 0              | 47 / 37 / 16 / 1                          |
| бросил низ | 0      | 8    | 87.5     | Отданный квартал 88        | 0.0    | 12.5     | 4.05 (3–5)           | 96           | 96 / 7              | 100          | 0              | 52 / 36 / 12 / 0                          |

## Readings, exploit and fixes (win %, 6/7/8 players)

| Прогон                                                              | понемногу 6/7/8 | Ворота 0 | ворота 6/7/8 | Ворота 0   | бросил низ 6/7/8 | Ворота 0   | раунды    |
| ------------------------------------------------------------------- | --------------- | -------- | ------------ | ---------- | ---------------- | ---------- | --------- |
| T текст как написан (впустить сразу; после «В ворота!» доливки нет) | 83/95/94        | 84/92/95 | 77/90/94     | 78/88/91   | 67/88/87         | 60/84/88   | 3.91–4.4  |
| T2 после «В ворота!» доливка продолжается                           | 82/90/92        | 83/96/95 | 78/91/92     | 79/90/93   | 67/86/86         | 65/86/85   | 3.92–4.31 |
| T3 стол не кричит «В ворота!»                                       | 84/94/94        | 79/94/92 | 79/90/94     | 82/89/94   | 72/86/85         | 67/84/83   | 3.93–4.32 |
| T4 рывок на Сайра (эксплойт)                                        | 97/99/100       | 97/98/98 | 99/100/100   | 99/100/100 | 98/100/100       | 98/100/100 | 2.62–2.99 |
| T5 рывок; правка: срыв при 20 хитах — только с раунда 4             | 97/99/100       | 92/99/97 | 98/99/100    | 99/100/99  | 98/99/100        | 99/98/99   | 2.7–3.15  |
| T6 базовая политика с правкой T5                                    | 83/94/92        | 86/92/94 | 76/92/94     | 77/90/88   | 69/86/87         | 68/86/84   | 3.99–4.31 |
| T7 рывок; правка: Сайр за створами до раунда 3                      | 31/38/50        | 18/25/34 | 64/68/79     | 40/54/58   | 57/66/75         | 33/46/52   | 3.99–4.32 |
| T8 базовая политика с правкой T7                                    | 75/91/90        | 75/84/89 | 61/80/85     | 68/78/84   | 56/72/74         | 53/75/74   | 4.2–4.59  |

- **T vs V1 + r:** within noise, which is ±4 points at 6 players. The edit reproduces the tuned set.
- **T2, refill after «В ворота!»:** no measurable effect. The ambiguity is real but harmless.
- **T3, never letting the neighbours in:** same win rate. Only the cost line changes, to «Соседи». «Впустить» is a free choice of cost, not of outcome.

## Consistency check

- Old values are gone from every file: «33 хита», «рядах 7–12», «раунда 2» for the portcullis, «без сигнала», «цена носилок», «переложить», K10–M11, «Доливка до семи», «4–7 раундов» and «20/60/60/20».
- The rendered `session-8.html`, `maps.html`, `battle-card.html` and `battle-dm-card.html` carry the new rules.
- `grey-hammer`, evening 6 `consequences[0]`, evening 7 scene 3 and `dmNote`, Эрдик's `knows` and `world.scaling` ×3 (L2 at Ворота 0–1) all agree.
- `world.endings` cost 1 («решётка опущена или арка свободна…») still fits: the portcullis can now fall only after the neighbours have arrived.

## Remaining problems

1. **High — rushing Сайр still wins (T4).**
   - What happens: Сайр stands on L1 (L2 at Ворота 0–1) in rounds 1–2. The heroes dash to him in round 1 and focus him. Sixty-seven HP fall in about two rounds, so «Сайр упал» or «знамя сорвано» (at 20 HP or less) ends the fight in 2.6–3.0 rounds. This wins 97–100 % at every dawn and size, Ворота 0 included.
   - Limiting the 20-HP tear to round 4 onward (T5) does not help: the heroes simply kill him.
   - **Smallest fix (T7/T8), one line in the encounter `tactics`, the DM card and evening 8 scene 2:** «До раунда 3 Сайр за створами: на поле его нет. В начале раунда 3 он встаёт на L1 (Ворота 0–1 — на L2) или на ближайшую свободную клетку арки».
   - With the fix, rushing loses (18–79 %) and the base table wins 75/91/90 (понемногу), 61/80/85 (ворота) and 56/72/74 (бросил низ). Fights last 4.2–4.6 rounds, and Ворота 0 becomes harder against a rushing table. The cost: «ворота» at 6 players drops to about 61 %.
2. **Medium — Ворота 0 is still not the hardest dawn for a sensible table.** It is within ±7 points of the printed dawn. With fix 1 it is hardest against a rushing table only.
3. **Low — the 20-HP withdrawal almost never fires (0–2 %).** Heroes take Сайр from above 20 HP straight to 0 in one round, and «Сайр упал» ends 20–54 % of fights. This is harmless.
   - Optional fix: «20 хитов и меньше — Сайр в тот же миг бросает бой и отходит в свой ход».
4. **Low — two scene choices are stale.**
   - Evening 8 scene 1 still asks «Кто в первом раунде бежит к вороту на A2», but the portcullis cannot be lowered before round 4.
   - Fix: «Кто к раунду 4 встаёт у ворота на A2».
5. **Low — new ambiguity: «В ворота!» and the refill.**
   - It is unclear whether the refill continues once the neighbours hold the arch.
   - Fix, one clause in the encounter and the DM card: «впущены — доливки через арку нет».
6. **Low — new ambiguity: no free cell for the moved hero.**
   - «сдвинув лежащего на соседнюю свободную клетку» does not say what happens when no free cell exists.
   - Fix: «нет свободной — Сайр в этот ход знамя не поднимает».
