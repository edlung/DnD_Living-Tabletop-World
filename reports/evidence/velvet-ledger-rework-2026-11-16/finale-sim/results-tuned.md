# Last bell — tuning run (2026-11-16, coordinator targets)

Scripts: `bell_sim.py` (levers in `AMB`, defaults = current text), `tune_search.py` (lever grid), `tune_eval.py`
(target checks). Fixed for every run: sold judge returns the bell at stroke 12 (`sold_returns`), and the
ambiguity resolutions R1–R5 (`hand_voids_book_now=False`; Аскар outside the limit; torn paper keeps the hook;
Опровержение +2 once any line is read; Ольга's line is spent on the nearest Рука). Morning: «беру 3».

## Chosen lever set (smallest found that puts the middle table in 40–60 % at 6/7/8)

1. A Book line read no longer gives Курс −1 (only its own benefit). 2. Сделка СЛ 15 (was 13). 3. Сделка limit 6 (was 7).

## Result, 400 bells per cell, printed benchmarks — Перевёртыш / Свой порог / С молотка

Levers: {'line_kd': 0, 'deal_limit': 6, 'deal_dc': 15}

| старт       | 6       | 7       | 8       | запас p50 (6) |
| ----------- | ------- | ------- | ------- | ------------- |
| осторожный  | 98/0/2  | 99/0/1  | 99/0/1  | +8            |
| средний     | 43/0/57 | 48/0/52 | 50/0/50 | -1            |
| рискованный | 100/0/0 | 100/0/0 | 100/0/0 | +12           |
| небрежный   | 0/0/100 | 0/0/100 | 0/0/100 | -25           |
| удачливый   | 100/0/0 | 100/0/0 | 100/0/0 | +16           |

Средний, 6: без Слуха/Шёпота/Заслона 0% (было 43%, Δ +43)

Качание от одного союзника (Перевёртыш, размер 6), max |Δ| по столам:
судья: 36 (средний)
Инга: 30 (средний)
Ная: 0 (удачливый)
Аскар: 6 (средний)
Сурьма: 4 (средний)

Одна стойка или один вид хода (средний, 6, покрыт %):
только Касса: 0
только Книга: 0
только Пол: 0
без Открытий: 44

## Feasibility of the full target set (finale levers only): NOT reachable

Grid over line Курс −1 {1,0}, Курс floor {1,3}, short cap {±3,±2}, Слух {−2,−1}, Скупка +{0,2},
Издержки +{0,4}, Надбавка +{0,1}, Сделка (К,предел,СЛ) ∈ {(3,7,13),(2,5,13),(3,7,16)} and, for line 0,
(предел 5–7, СЛ 13/15): ~250 combinations, 60–100 bells each. In every combination the cautious table's median
margin stays ≥ 4 bells and the risky table's ≥ 6 bells above the middle table's (typically +8 / +10), while
the middle table's p10–p90 spread is only about −8…+2. So whenever the middle table is at 40–60 %, cautious and
risky are at ≥ 95 %. Uniform finale levers move all three tables together; the printed evening-7 benchmarks
put risky (gap 16) and cautious (gap 23) far ahead of middle (gap 33), and their finale resources are similar.
The same narrow spread makes any single cancel-ally worth 30+ points on the table that sits at 50 % (судья 36,
Инга 30 on the middle table above), so «no ally swings > 15 points» is also unreachable at a 40–60 % table
without making the bell a dice game.

## What the targets would need instead: benchmark shift (evening 7 end), same tuned rules

| старт (Долг утра +сдвиг) | 6       | 7       | 8       |
| ------------------------ | ------- | ------- | ------- |
| осторожный +6            | 68/0/32 | 76/0/24 | 80/0/20 |
| средний +0               | 43/0/57 | 48/0/52 | 50/0/50 |
| рискованный +11          | 54/0/46 | 50/0/50 | 68/0/32 |

Cautious needs Долг +6 (e.g. 46/15/6 instead of 40/15/6) and risky Долг +11 (e.g. 80/51/9 instead of 69/51/9)
at the end of evening 7 — or the targets for those two tables move to ≥ 90 %.
