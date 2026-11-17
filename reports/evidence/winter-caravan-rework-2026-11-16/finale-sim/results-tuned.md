# winter-caravan — tuned run levers (evening 8), 2026-11-16

Request: find the smallest set of levers (a)–(e) that meets the coordinator's targets at 6/7/8 players,
400 runs per cell. Files: `sim.py` (now with a `RULES` block; defaults = the campaign as written, so
`results.md`/`results.json` stay the baseline), `tuned.py` (policy space, search and evaluation),
`search.json`, `search2.json`, `search3.json` (grids, 6 players, 60–80 runs/cell), `tuned-final.json`
(the chosen set, 400 runs/cell). Reproduce:
`python3 tuned.py eval '{"run_only": true, "people_only": true, "gorlo_from7": true, "otrog_max": 1}' 400 '{"otrog_bitable": false}'`.

## Changes to the simulator for this pass

- Policy improvements a sensible table would use: walkers wait at the Горло until the slide (it is safe and
  still counts as arrived); heroes on the Горло dig out the buried, two at a time, cleric first; the dawn
  plan may leave cargo and spare mules (with the mule fix a mule without a leader goes down by itself).
- Recommended rulings applied (section 4): the White's 11 damage to a buried hero counts as one of her
  victims; a downed person may ride a led mule; the Otrog lighter is not in his section that turn.
- The Площадка fight model is unchanged except that the 7–8 player bonus was removed (the encounter adds a
  wolf at 7–8, so the odds should be the same): P(Г1) 0.7 / 0.5 / 0.3, mule losses as in `results.md`.
- «Real decisions» now also counts slow people at the edge of the Желоб (push on or stay on the Морена) and
  is reported per live turn (someone still below the Горло, buried, or being rescued).

## Search

Grids tried (all with (a) and the mule fix): noise from Г4 / Г3 / Г2; pack 3, 2–4, 1–4, 2–5, 1–6
(even die); Otrog fires 2 / 1; Горло entered from 7 or freely; walker and led-mule speed in the Желоб
2 or 1; tail fires; digging with or without a roll. Smallest set with the best score:

1. (a) the run's ending counts only people lost in the run;
2. (c) the pack goes only to people, and a mule without a leader goes down by itself;
3. (d) the Горло is entered only from section 7;
4. (e) one Otrog fire per run.

Noise mark (Г4) and pack speed (3) stay as written: changing them did not move any cell by more than
~5 points once (d) and (e) are in.

## Result, 400 runs per cell

| стол           | знает    | игроков | цель ВУ %   | ВУ / ЧП / Склон % | дошли (p10–p90) | сани | решений/живой ход | старт Г1 % | ВУ при Г1 / при Г2 % |
| -------------- | -------- | ------- | ----------- | ----------------- | --------------- | ---- | ----------------- | ---------- | -------------------- |
| бережливый     | знает    | 6       | 75–95       | 100 / 0 / 0       | 13.0 (13–13)    | 0.72 | 1.38              | 72         | 100.0 / 98.2         |
| бережливый     | знает    | 7       | 75–95       | 100 / 0 / 0       | 14.0 (14–14)    | 0.67 | 1.39              | 66         | 100.0 / 99.3         |
| бережливый     | знает    | 8       | 75–95       | 100 / 0 / 0       | 15.0 (15–15)    | 0.68 | 1.40              | 68         | 100.0 / 99.2         |
| бережливый     | не знает | 6       | 45–70       | 70 / 0 / 30       | 11.3 (7–13)     | 0.00 | 1.05              | 70         | 100.0 / 0.0          |
| бережливый     | не знает | 7       | 45–70       | 71 / 0 / 29       | 12.5 (8–14)     | 0.00 | 1.10              | 71         | 100.0 / 0.0          |
| бережливый     | не знает | 8       | 45–70       | 66 / 0 / 34       | 13.2 (9–15)     | 0.00 | 1.15              | 66         | 100.0 / 0.0          |
| средний        | знает    | 6       | 35–60       | 48 / 52 / 0       | 11.5 (11–12)    | 0.48 | 0.91              | 48         | 100.0 / 0.0          |
| средний        | знает    | 7       | 35–60       | 46 / 54 / 0       | 12.5 (12–13)    | 0.46 | 1.01              | 46         | 100.0 / 0.0          |
| средний        | знает    | 8       | 35–60       | 51 / 49 / 0       | 13.5 (13–14)    | 0.51 | 1.06              | 51         | 100.0 / 0.0          |
| средний        | не знает | 6       | 15–40       | 51 / 0 / 49       | 9.7 (7–12)      | 0.00 | 1.07              | 51         | 100.0 / 0.0          |
| средний        | не знает | 7       | 15–40       | 51 / 0 / 49       | 10.8 (7–13)     | 0.00 | 1.10              | 51         | 100.0 / 0.0          |
| средний        | не знает | 8       | 15–40       | 54 / 2 / 45       | 12.0 (9–14)     | 0.00 | 1.13              | 54         | 100.0 / 0.0          |
| расточительный | знает    | 6       | ≤20 + split | 0 / 8 / 92        | 9.0 (6–10)      | 0.00 | 0.42              | 27         | 0.0 / 0.0            |
| расточительный | знает    | 7       | ≤20 + split | 0 / 28 / 72       | 11.1 (10–12)    | 0.00 | 0.51              | 34         | 0.0 / 0.0            |
| расточительный | знает    | 8       | ≤20 + split | 0 / 26 / 74       | 12.0 (11–13)    | 0.00 | 0.51              | 32         | 0.0 / 0.0            |
| расточительный | не знает | 6       | ≤20 + split | 0 / 8 / 92        | 7.0 (5–10)      | 0.00 | 0.40              | 26         | 0.0 / 0.0            |
| расточительный | не знает | 7       | ≤20 + split | 0 / 7 / 93        | 8.0 (6–11)      | 0.00 | 0.39              | 29         | 0.0 / 0.0            |
| расточительный | не знает | 8       | ≤20 + split | 0 / 7 / 93        | 8.7 (6–12)      | 0.00 | 0.40              | 27         | 0.0 / 0.0            |

## What this means (read before applying)

- Bands met: thrifty unlearned (66–71), average learned (46–51), wasteful «Вся упряжь» 0.
  Not met: thrifty learned 99.5–99.8 (cap 95), average unlearned 51–54 (cap 40), wasteful split weak
  (7–8% «Через перевал» unlearned, 8–28% learned), decisions ≥ 1 per live turn fails for the wasteful table
  (0.4–0.5) and average learned at 6 players (0.91).
- **The run still does not decide.** For thrifty and average tables the outcome given the Площадка start is
  binary: Г1 → 100% «Вся упряжь», Г2 → 0% (only thrifty learned survives Г2, 98–99%). Average learned fails
  at Г2 because one Otrog fire plus two tail fires need 4 lights and it has 3. Every percentage above is the
  assumed P(Г1) of the fight model (not printed in the campaign). A first estimate of the fight (six level-3
  heroes, about 30 damage a round against AC 13, 38 needed by the end of round 4) suggests P(Г1) of 0.85+ for
  any table that hits the White, which would push thrifty and average cells to ~85–100%.
- The cause is structural: every loss in the run is deterministic once the start is known (the pack always
  reaches the tail; a fire always stops it; buried heroes at section 6–7 are dug out from the Горло). Dice in
  the pack's speed are bought off with fire; a dig roll is bought off by rescuers. With levers (a)–(e) only
  the timing cliff (Горло from 7) creates losses, and it is a cliff, not a slope.
- To make the run itself decide, one in-run die that resources reduce but cannot remove is needed — for
  example «огонь в хвосте держит стаю на 1–4 к6; на 5–6 она проходит огонь и кусает» (sacks stay certain).
  Not validated here; I estimate it would put thrifty unlearned near P(Г1) (two sacks cover the noise turns)
  and average unlearned near 0.45·P(Г1). It needs its own run of `tuned.py` before an editor applies it.
- The wasteful table has no real decisions at 6 players under any lever: every hero leads a mule or pulls
  the нарта, there is no fire, and the bites can only hit lone weakened walkers.

## Rule wording (Russian, verbatim)

Levers (only if the owner accepts the caveat above):

- (a) world.json endings, run-dm-slide «Недошедшие», session 8: «Исход решают люди, потерянные в беге:
  отрезанные завалом, оставшиеся на склоне и забранные Белой. Ушедшие назад и оставшиеся у Явры до вечера 8
  исход не меняют — их называют у огня и показывают в последнем образе.»
- (c) run-rules, run-dm-card, session 7/8: «Стая идёт до 3 участков к самому заднему участку с людьми; мул
  без ведущего уходит вниз сам (мулов −1).»
- (d) run-rules, run-card, session 8: «В Горло (8) входят только с участка 7.»
- (e) run-know, run-dm-card, session 8: «Огонь на Отроге — один раз за бег.»

Clarifications (apply in any case):

- Ev7 sledge choice: «Выбрать сани на подъём и кто встаёт в постромки (два мула и четверо в постромках —
  сани идут по 2; два мула и двое или один мул и четверо — по 1).»
- Tail fire: «Огонь в хвосте и мешок — вместо хода: кто зажёг огонь или бросил мешок, остаётся в своём
  участке и в следующий ход идёт оттуда.»
- Otrog timing: «Огонь на Отроге, зажжённый в ход, когда Белая шагнула на К, откладывает сход на ход;
  зажжённый в ход, когда она уже стоит на карнизе, ничего не даёт.»
- Otrog lighter: «Кто жжёт огонь на Отроге, в этот ход стоит на Отроге: стая его не кусает и на нём не
  останавливается.»
- The White over the slide: «Огонь над завалом зажигают в шаге 2; в шаге 1 следующего хода Белая в этот
  участок не идёт.»
- Buried hero: «Если на Завале нет других жертв, Белая наносит 11 урона одному засыпанному герою, ближе к
  Горлу; это её жертва на этот ход и считается в двух.»
- Downed on a mule: «Сбитого, ослабевшего или обмороженного можно везти на муле, которого ведёт рука (два
  места), — со скоростью мула.»
- Bitten mule's rider: «Если укус уводит мула с седоком, седок остаётся в участке; сбитый или обмороженный
  седок лежит, пока его не поднимут или не понесут.»
- Sledge mules: «Мулов в санях ведут те, кто в постромках; отдельный ведущий им не нужен.»
- Слабость (run-rules, sheet, session 8): «Слабость — помеха на проверки Силы и спасброски Телосложения.»
  Session 8, Еда 0: «без завтрака: все NPC ослабели, у героев Слабость».

## Benchmark text that must change if the levers are applied

- Session 8 and run-dm-card: «из Г1 — в конце хода 5, из Г2 — 4; огонь на Отроге — на ход позже (не
  больше двух)» → «(один раз)»; scene 2 choice «не больше двух раз за бег» → «один раз»; run-know «Не больше
  двух раз за бег» → «Один раз за бег».
- Session 8 «Изменения после решений» (three ending lines), scene 3 «Недошедшие за кампанию: …»,
  world.json `endings[].requires`, run-dm-slide «Недошедшие: …» → the (a) wording.
- Session 7 «Если Кто-то остался у Явры этим утром → … в конце кампании считается недошедшим» → «не
  меняет исход бега; его называют у огня».
- «Мул без ведущего стоит» in run-rules, run-dm-card, session 7 scene 2 and 3, session 8 (prep, scene 2) and
  world.json tableGuidance[4] and scaling → the (c) wording.
- Session 7 «Обычно огонь нужен на ходах 2 и 3» and «Ориентир подъёма: бережливый стол тратит два огня» →
  count the lighter's lag (with three sledges and one free person: two fires and a bite, or three fires).
- README and world.json truth «Плата»: «Сколько людей дойдёт … решают лист и то, поняли ли вы стаю» →
  until an in-run die is added, «решают лист, бой у Площадки и то, поняли ли вы стаю».
