# winter-caravan — finale run simulation (evening 8), final critic

Date 2026-11-16. Scope: `campaigns/collection-2026/winter-caravan/` as it is now (after round 1). Simulator
`sim.py` (Python 3, no dependencies), raw output `results.json`, table formatter `tables.py`.
Reproduce: `python3 sim.py 400 > results.json && python3 tables.py results.json`.

## 1. What the simulator implements (from the campaign text only)

Sources: `handouts/run-rules`, `run-card`, `run-know`, `run-dm-card`, `run-dm-slide`, `food-warmth-sheet`,
`session-7.html`, `session-8.html`, `source/world.json` (endings).

- Track 0–12 (0 Площадка, 1–3 Морена, 4–7 Желоб, 8 Горло, 9–11 Скат, 12 Порог). Turn: 1) White, 2) caravan, 3) pack, 4) cornice. Run ends when nobody on 0–11 can still arrive or at the end of turn 10 (8–11 arrive).
- Speeds: walker / led mule / нарта with two pullers 2 (Завал 1); sledge 2 mules + 4 pullers 2 on Морена, 1 in
  Желоб; 2+2 or 1+4 → 1; less → stands; Скат 3; enters Желоб no further than 4; Горло costs a turn unless
  Остап's rope (rope assumed in hand). Weakened NPC, frostbitten hero, two carrying one → 1. Связка = slowest.
- Hands = heroes + healthy NPCs; a mule without a leader stands; one job per person; on the move: lead, pull,
  carry, Лечащее слово; instead of the move: tail fire, sack, Otrog fire, pass the pack, dig, other healing.
  Weakened: speed 1, no pulling/carrying/fire; may ride a led mule (2 places).
- White: start Г1/Г2, one step per turn to К; on К without an Otrog fire the previous turn → stands, slide in
  step 4. Otrog fire (learned only, free person on 2–5, Тепло/torch, ≤2 per run): next step 1 she does not
  step / the turn on К does not count. Noise (bite in 4–7 while she is on Г4 or К) → slide this turn.
- Pack: starts −1, moves ≤3 toward the rearmost section with people or mules (lone lying people skipped);
  tail fire in that section → no bite, pack one section behind; sack → no bite, pack where it stopped; else a
  bite: table picks mule / hero −7 / NPC down. No bites on 8+. Pass (learned, everyone on 0–3): nobody moves,
  pack gone, no noise. At the slide pack on 4–7 buried, on 0–3 leaves.
- Slide: 4–7 buried (sledges, нарта, cargo lost); 0–3 cut off (alive, undelivered; downed go with them if
  someone is on feet, else left on the slope). Digging from the Горло side, 1 section/turn, dig instead of the
  move; hero self-digs with Athletics DC 12 (disadvantage with Слабость); dug NPC is down, dug hero moves next
  turn. White on the Завал from step 1 after the slide: one victim per turn (carried/down → weakened → NPC →
  mule, ties nearer the Горло), заслон hero takes 11 and it counts as her prey; buried hero alone → 11 damage;
  ≤2 victims, ≤3 turns. Horn on 8–12: from the next turn carried/weakened on 9–11 move 2.
- Count: departed + left at Явра + cut off + left on the slope + taken; 0 «Вся упряжь», 1–2 «Через перевал»,
  3+ or no hero at the fire «Склон взял своё».

### Table policy (stated)

Dawn plan chosen by dry run among ≤192 named plans (pass on turn 1 or not; 0/1/2 Otrog fires; one sledge
with the boxes or none; slow people left at the Площадка or not; carry a frostbitten NPC by two or not;
0/2 escorts for the slowest unit; a hero rear guard on the Морена or not), objective: best ending, then fewest
undelivered, most cargo, most sledges, least fire. Dawn transport is greedy: frostbitten then weakened on
mules (NPC leaders first), the нарта next, cargo on mules (2 places), spare mules led if hands allow, ≥2 free
walkers kept. Per turn (greedy): Healing Word on downed people first; Otrog fire only when the projection says
it moves someone out of 4–7 at the slide; tail fire/sack only when the bite would be noise or no hero with

> 7 hp / empty mule is there (else the table takes the bite on the highest-hp hero, then an empty mule, then
> Тирна's knife, then an NPC next to a cleric); a lighter is the free person whose staying keeps him in the
> rearmost section, nearest the front; after the slide heroes on 8 dig out reachable buried people, a cleric
> heals, two carry. The decoy-mule tactic is off in the main runs (exploit table below).

### Starting states (end of evening 7)

The campaign prints only Е/Т after night 7 (session 7: 4/5, 1/1, 0/0), the breakfast rule and «у бережливого
стола на рассвете их семь» (world.scaling). Mules, departures, frostbite, boxes per table are not printed in
the campaign; they were taken from the skeleton (§2.7), which the printed Е/Т lines follow:

| стол           | завтрак  | огонь (Т+факелы)              | мешки | мулы | груз           | люди                                                                                        | Белая      |
| -------------- | -------- | ----------------------------- | ----- | ---- | -------------- | ------------------------------------------------------------------------------------------- | ---------- |
| бережливый     | полный   | 5+2 = 7                       | 2     | 6    | 4 ящика        | 7 NPC здоровы                                                                               | Г1 (p≈0.7) |
| средний        | половина | 1+2 = 3                       | 0     | 6    | 3 ящика, 1 тюк | Глафира ушла (вечер 4); Херет, Вавила ослабели                                              | Г2 (p≈0.5) |
| расточительный | нет      | 0 (с «знает» — 2 факела Явры) | 0     | 4    | 2 ящика, 1 тюк | обморожены Вавила, Херет, Сельда; Бреша, Тарма, Глафира, Малкен ослабели; у героев Слабость | Г2 (p≈0.7) |

«Знает» = Отрог + пропуск стаи открыты (printed for thrifty/average; for wasteful, the learned variant also
gets Явра's two torches — assumption, her story and the torches come together). Площадка fight is not
simulated blow by blow; per run it is rolled (assumption): P(Г1) 0.7 / 0.5 / 0.3 (+0.1 at 7–8 players), mules
lost 0/1/2 with 0.6/0.3/0.1, 0.4/0.4/0.2, 0.3/0.5/0.2 (p0 +0.1 at 7–8), heroes start at full hp minus
U(0, hp/2). Hero hp/Athletics: fighter 31/+5, rogue 24/+0, cleric 24/+1 with 4 Лечащее слово, wizard 20/−1.
Dice: self-dig d20, Площадка outcome, starting hp (the text fixes bite damage at 7 and the table chooses the
victim, so bites are not random).

## 2. Results — 400 runs per cell, main readings

| стол           | Отрог+пропуск | игроков | Вся упряжь % | Через перевал % | Склон % | дошли, среднее (p10–p90) | сани | ящики+тюки | огня | ход схода | старт Г1 % | решений/ход / ходов без решений |
| -------------- | ------------- | ------- | ------------ | --------------- | ------- | ------------------------ | ---- | ---------- | ---- | --------- | ---------- | ------------------------------- |
| бережливый     | знает         | 6       | 100          | 0               | 0       | 13.0 (13–13)             | 1.00 | 4.0        | 3.9  | 6.0       | 71         | 1.26 / 17%                      |
| бережливый     | знает         | 7       | 100          | 0               | 0       | 14.0 (14–14)             | 1.00 | 4.0        | 3.6  | 6.0       | 80         | 1.23 / 17%                      |
| бережливый     | знает         | 8       | 100          | 0               | 0       | 15.0 (15–15)             | 1.00 | 4.0        | 3.6  | 6.0       | 81         | 1.23 / 17%                      |
| бережливый     | не знает      | 6       | 91           | 9               | 0       | 12.9 (13–13)             | 0.00 | 4.0        | 2.0  | 4.7       | 74         | 1.00 / 30%                      |
| бережливый     | не знает      | 7       | 95           | 5               | 0       | 13.9 (14–14)             | 0.00 | 4.0        | 2.0  | 4.8       | 79         | 1.04 / 28%                      |
| бережливый     | не знает      | 8       | 93           | 7               | 0       | 14.9 (15–15)             | 0.00 | 4.0        | 2.0  | 4.8       | 76         | 1.01 / 30%                      |
| средний        | знает         | 6       | 0            | 100             | 0       | 11.9 (11–12)             | 0.47 | 4.0        | 1.9  | 5.5       | 47         | 0.52 / 61%                      |
| средний        | знает         | 7       | 0            | 100             | 0       | 12.9 (13–13)             | 0.63 | 4.0        | 2.3  | 5.6       | 63         | 0.63 / 55%                      |
| средний        | знает         | 8       | 0            | 100             | 0       | 13.9 (14–14)             | 0.60 | 4.0        | 2.2  | 5.6       | 60         | 0.60 / 56%                      |
| средний        | не знает      | 6       | 0            | 100             | 0       | 11.8 (11–12)             | 0.00 | 4.0        | 2.0  | 4.5       | 50         | 0.85 / 38%                      |
| средний        | не знает      | 7       | 0            | 99              | 1       | 12.8 (12–13)             | 0.00 | 4.0        | 2.0  | 4.6       | 58         | 0.90 / 35%                      |
| средний        | не знает      | 8       | 0            | 100             | 0       | 13.8 (13–14)             | 0.00 | 4.0        | 2.0  | 4.6       | 58         | 0.90 / 35%                      |
| расточительный | знает         | 6       | 0            | 30              | 70      | 10.0 (9–11)              | 0.00 | 0.0        | 0.0  | 4.2       | 27         | 0.56 / 56%                      |
| расточительный | знает         | 7       | 0            | 37              | 63      | 11.2 (10–12)             | 0.00 | 0.1        | 0.0  | 4.3       | 40         | 0.89 / 33%                      |
| расточительный | знает         | 8       | 0            | 35              | 65      | 12.2 (11–13)             | 0.00 | 0.8        | 0.0  | 4.3       | 41         | 0.89 / 34%                      |
| расточительный | не знает      | 6       | 0            | 28              | 72      | 10.1 (9–11)              | 0.00 | 0.0        | 0.0  | 4.3       | 35         | 0.00 / 100%                     |
| расточительный | не знает      | 7       | 0            | 44              | 56      | 11.3 (10–12)             | 0.00 | 0.1        | 0.0  | 4.3       | 38         | 0.00 / 100%                     |
| расточительный | не знает      | 8       | 0            | 39              | 61      | 12.3 (11–13)             | 0.00 | 0.7        | 0.0  | 4.4       | 41         | 0.00 / 100%                     |

Deterministic view (6 players, 20 runs each, fixed Площадка result):

| старт | стол  | знает          | Вся упряжь % | Через перевал % | Склон % | дошли | сани | план |
| ----- | ----- | -------------- | ------------ | --------------- | ------- | ----- | ---- | ---- |
| Г1    | lost0 | бережливый     | знает        | 100             | 0       | 0     | 13.0 | 1.0  | {"otrog": 1, "sledge": true}     |
| Г1    | lost0 | бережливый     | не знает     | 100             | 0       | 0     | 13.0 | 0.0  | {}                               |
| Г1    | lost0 | средний        | знает        | 0               | 100     | 0     | 12.0 | 1.0  | {"otrog": 1, "sledge": true}     |
| Г1    | lost0 | средний        | не знает     | 0               | 100     | 0     | 12.0 | 0.0  | {}                               |
| Г1    | lost0 | расточительный | знает        | 0               | 100     | 0     | 11.0 | 0.0  | {"carry_slow": true}             |
| Г1    | lost0 | расточительный | не знает     | 0               | 100     | 0     | 11.0 | 0.0  | {"carry_slow": true}             |
| Г1    | lost1 | бережливый     | знает        | 100             | 0       | 0     | 13.0 | 1.0  | {"otrog": 1, "sledge": true}     |
| Г1    | lost1 | бережливый     | не знает     | 100             | 0       | 0     | 13.0 | 0.0  | {}                               |
| Г1    | lost1 | средний        | знает        | 0               | 100     | 0     | 12.0 | 1.0  | {"otrog": 1, "sledge": true}     |
| Г1    | lost1 | средний        | не знает     | 0               | 100     | 0     | 12.0 | 0.0  | {}                               |
| Г1    | lost1 | расточительный | знает        | 0               | 0       | 100   | 10.0 | 0.0  | {"otrog": 2, "carry_slow": true} |
| Г1    | lost1 | расточительный | не знает     | 0               | 0       | 100   | 10.0 | 0.0  | {"carry_slow": true}             |
| Г2    | lost0 | бережливый     | знает        | 100             | 0       | 0     | 13.0 | 1.0  | {"otrog": 2, "sledge": true}     |
| Г2    | lost0 | бережливый     | не знает     | 90              | 10      | 0     | 12.9 | 0.0  | {}                               |
| Г2    | lost0 | средний        | знает        | 0               | 100     | 0     | 11.9 | 0.0  | {"otrog": 1, "pass": true}       |
| Г2    | lost0 | средний        | не знает     | 0               | 100     | 0     | 11.8 | 0.0  | {}                               |
| Г2    | lost0 | расточительный | знает        | 0               | 100     | 0     | 11.0 | 0.0  | {"carry_slow": true}             |
| Г2    | lost0 | расточительный | не знает     | 0               | 100     | 0     | 11.0 | 0.0  | {"carry_slow": true}             |
| Г2    | lost1 | бережливый     | знает        | 100             | 0       | 0     | 13.0 | 1.0  | {"otrog": 2, "sledge": true}     |
| Г2    | lost1 | бережливый     | не знает     | 90              | 10      | 0     | 12.9 | 0.0  | {}                               |
| Г2    | lost1 | средний        | знает        | 0               | 100     | 0     | 11.9 | 0.0  | {"otrog": 1, "pass": true}       |
| Г2    | lost1 | средний        | не знает     | 0               | 100     | 0     | 11.8 | 0.0  | {}                               |
| Г2    | lost1 | расточительный | знает        | 0               | 0       | 100   | 10.0 | 0.0  | {"otrog": 2, "carry_slow": true} |
| Г2    | lost1 | расточительный | не знает     | 0               | 0       | 100   | 10.0 | 0.0  | {"carry_slow": true}             |

## 3. Ambiguous readings and the decoy exploit (200 runs per cell, averaged over 6/7/8 players)

Main readings: Otrog fire lit in the turn she steps onto К delays (run-know); the Otrog lighter still counts in
his section for the pack; a downed person cannot ride a mule; a fire over the slide holds her at the next step
1; her 11 damage to a buried hero is not one of her two victims.

| вариант                 | стол           | знает    | Вся упряжь % (Δ) | Через перевал % (Δ) | Склон % (Δ) | сани (Δ)     | мулов-приманок |
| ----------------------- | -------------- | -------- | ---------------- | ------------------- | ----------- | ------------ | -------------- |
| приманка-мул (эксплойт) | бережливый     | знает    | 100 (+0)         | 0 (+0)              | 0 (+0)      | 0.75 (-0.25) | 3.6            |
| приманка-мул (эксплойт) | бережливый     | не знает | 100 (+7)         | 0 (-7)              | 0 (+0)      | 0.00 (+0.00) | 3.6            |
| приманка-мул (эксплойт) | средний        | знает    | 0 (+0)           | 100 (+0)            | 0 (-0)      | 0.55 (-0.02) | 1.4            |
| приманка-мул (эксплойт) | средний        | не знает | 0 (+0)           | 100 (+0)            | 0 (-0)      | 0.00 (+0.00) | 1.3            |
| приманка-мул (эксплойт) | расточительный | знает    | 0 (+0)           | 36 (+2)             | 64 (-2)     | 0.00 (+0.00) | 0.0            |
| приманка-мул (эксплойт) | расточительный | не знает | 0 (+0)           | 37 (-0)             | 63 (+0)     | 0.00 (+0.00) | 0.0            |
| otrog_arrival=nothing   | бережливый     | знает    | 93 (-7)          | 7 (+7)              | 0 (+0)      | 0.75 (-0.25) | 0.0            |
| otrog_arrival=nothing   | бережливый     | не знает | 94 (+1)          | 6 (-1)              | 0 (+0)      | 0.00 (+0.00) | 0.0            |
| otrog_arrival=nothing   | средний        | знает    | 0 (+0)           | 99 (-1)             | 1 (+1)      | 0.58 (+0.01) | 0.0            |
| otrog_arrival=nothing   | средний        | не знает | 0 (+0)           | 100 (-0)            | 0 (+0)      | 0.00 (+0.00) | 0.0            |
| otrog_arrival=nothing   | расточительный | знает    | 0 (+0)           | 37 (+3)             | 63 (-3)     | 0.00 (+0.00) | 0.0            |
| otrog_arrival=nothing   | расточительный | не знает | 0 (+0)           | 37 (+0)             | 63 (-0)     | 0.00 (+0.00) | 0.0            |
| otrog_bitable=False     | бережливый     | знает    | 100 (+0)         | 0 (+0)              | 0 (+0)      | 1.00 (+0.00) | 0.0            |
| otrog_bitable=False     | бережливый     | не знает | 94 (+1)          | 6 (-1)              | 0 (+0)      | 0.00 (+0.00) | 0.0            |
| otrog_bitable=False     | средний        | знает    | 0 (+0)           | 100 (+0)            | 0 (-0)      | 0.55 (-0.02) | 0.0            |
| otrog_bitable=False     | средний        | не знает | 0 (+0)           | 100 (+0)            | 0 (-0)      | 0.00 (+0.00) | 0.0            |
| otrog_bitable=False     | расточительный | знает    | 0 (+0)           | 38 (+4)             | 62 (-4)     | 0.00 (+0.00) | 0.0            |
| otrog_bitable=False     | расточительный | не знает | 0 (+0)           | 36 (-1)             | 64 (+1)     | 0.00 (+0.00) | 0.0            |
| down_rides=True         | бережливый     | знает    | 100 (+0)         | 0 (+0)              | 0 (+0)      | 1.00 (+0.00) | 0.0            |
| down_rides=True         | бережливый     | не знает | 94 (+2)          | 6 (-2)              | 0 (+0)      | 0.00 (+0.00) | 0.0            |
| down_rides=True         | средний        | знает    | 0 (+0)           | 100 (+0)            | 0 (-0)      | 0.56 (-0.00) | 0.0            |
| down_rides=True         | средний        | не знает | 0 (+0)           | 100 (+0)            | 0 (-0)      | 0.00 (+0.00) | 0.0            |
| down_rides=True         | расточительный | знает    | 0 (+0)           | 35 (+1)             | 65 (-1)     | 0.00 (+0.00) | 0.0            |
| down_rides=True         | расточительный | не знает | 0 (+0)           | 38 (+1)             | 62 (-1)     | 0.00 (+0.00) | 0.0            |
| slide_fire=never        | бережливый     | знает    | 100 (+0)         | 0 (+0)              | 0 (+0)      | 1.00 (+0.00) | 0.0            |
| slide_fire=never        | бережливый     | не знает | 94 (+1)          | 6 (-1)              | 0 (+0)      | 0.00 (+0.00) | 0.0            |
| slide_fire=never        | средний        | знает    | 0 (+0)           | 100 (+0)            | 0 (-0)      | 0.59 (+0.02) | 0.0            |
| slide_fire=never        | средний        | не знает | 0 (+0)           | 99 (-0)             | 1 (+0)      | 0.00 (+0.00) | 0.0            |
| slide_fire=never        | расточительный | знает    | 0 (+0)           | 38 (+4)             | 62 (-4)     | 0.00 (+0.00) | 0.0            |
| slide_fire=never        | расточительный | не знает | 0 (+0)           | 37 (-0)             | 63 (+0)     | 0.00 (+0.00) | 0.0            |
| hero_hit_counts=True    | бережливый     | знает    | 100 (+0)         | 0 (+0)              | 0 (+0)      | 1.00 (+0.00) | 0.0            |
| hero_hit_counts=True    | бережливый     | не знает | 96 (+3)          | 4 (-3)              | 0 (+0)      | 0.00 (+0.00) | 0.0            |
| hero_hit_counts=True    | средний        | знает    | 0 (+0)           | 100 (-0)            | 0 (+0)      | 0.57 (+0.00) | 0.0            |
| hero_hit_counts=True    | средний        | не знает | 0 (+0)           | 100 (+0)            | 0 (-0)      | 0.00 (+0.00) | 0.0            |
| hero_hit_counts=True    | расточительный | знает    | 0 (+0)           | 39 (+5)             | 61 (-5)     | 0.00 (+0.00) | 0.0            |
| hero_hit_counts=True    | расточительный | не знает | 0 (+0)           | 36 (-1)             | 64 (+1)     | 0.00 (+0.00) | 0.0            |

## 4. Example turn logs (6 players, seed 1)

**thrifty|learned|Г1|mules lost 0** — план {'otrog': 1, 'sledge': True}: Вся упряжь, недошедших 0, дошли 13.  
Т1: укус на 2 — Остап −7 (24); Т2: огонь на Отроге — Тирна с участка 2 (Белая Г3); Т2: укус на 2 — Тирна −7 (24); Т3: укус на 4 — Тирна −7 (17); Т4: огонь в хвосте — Кея на 6 (Белая Г4); Т5: огонь в хвосте — Кея на 6 (Белая К); Т6: СХОД.

**thrifty|unlearned|Г2|mules lost 0** — план {}: Через перевал, недошедших 1, дошли 12.  
Т1: укус на 2 — Остап −7 (24); Т2: огонь в хвосте — Тирна на 2 (Белая Г4); Т3: огонь в хвосте — Остап на 4 (Белая К); Т4: укус на 6 — Тирна −7 (24); Т4: СХОД. Остап@6, Тирна@6; Т5: Белая — засыпанному Остап 11 урона; Т5: Тирна откапывается сам на 6; Т6: Белая — засыпанному Остап 11 урона; Т7: Белая — засыпанному Остап 11 урона; Т7: Кея откапывает Остап на 6

**average|learned|Г2|mules lost 1** — план {'otrog': 1, 'pass': True}: Через перевал, недошедших 1, дошли 12.  
Т1: стаю пропускают на Морене (Белая Г3); Т3: огонь на Отроге — Тирна с участка 2 (Белая К); Т5: СХОД. Тирна@6; Т6: Белая — засыпанному Тирна 11 урона; Т7: Белая — засыпанному Тирна 11 урона; Т7: Тирна откапывается сам на 6

**average|unlearned|Г2|mules lost 1** — план {}: Через перевал, недошедших 2, дошли 11.  
Т1: укус на 2 — Остап −7 (24); Т2: огонь в хвосте — Тирна на 2 (Белая Г4); Т3: огонь в хвосте — Кея на 4 (Белая К); Т4: укус на 6 — Тирна −7 (24); Т4: СХОД. Кея@6, Тирна@6; Т5: Белая — засыпанному Кея 11 урона; Т5: Тирна откапывается сам на 6; Т6: Белая — засыпанному Кея 11 урона; Т7: Белая — засыпанному Кея 11 урона; Т7: Остап откапывает Кея на 6

**wasteful|unlearned|Г2|mules lost 1** — план {'carry_slow': True}: Склон взял своё, недошедших 3, дошли 10.  
Т1: укус на 1 — Тарма (NPC) сбит; Т2: укус на 2 — Глафира (NPC) сбит; Т3: укус на 3 — Малкен (NPC) сбит; Т4: СХОД. Тарма@1, Глафира@2, Малкен@3

**wasteful|learned|Г1|mules lost 0** — план {'carry_slow': True}: Через перевал, недошедших 2, дошли 11.  
Т1: укус на 1 — Глафира (NPC) сбит; Т2: укус на 2 — Малкен (NPC) сбит; Т5: СХОД. Глафира@1, Малкен@2

## 5. Findings

1. **What decides the ending is the state at dawn, not the run.** Average table: Глафира left on evening 4,
   so «Вся упряжь» is impossible and «Через перевал» comes out in 99–100% of runs whatever is played in the
   run. Wasteful table: 7 people need a ride, rides at speed 2 = mules + нарта; with 4 mules two weakened walk
   at speed 1 and are cut off or buried (2 undelivered, «Через перевал»), with 3 mules three (Склон). The
   Площадка fight's mule losses (not the run) decide the wasteful ending; Г1/Г2 does not matter.
2. **Knowing the pack/White barely changes people counts.** Thrifty: 100% vs 91–95% «Вся упряжь»; average and
   wasteful: no change. Walkers at speed 2 are on 8 at the end of turn 4 — exactly the slide from Г2 without
   Otrog — so an unlearned table survives with two tail fires. The learned actions buy sledges/cargo:
   sledges saved 1.0 (thrifty learned) vs 0 (unlearned), 0.5–0.6 vs 0 (average). «Пропустить стаю» costs a
   whole turn and is chosen only by the average table together with an Otrog fire (37–53%); thrifty never.
3. **The real price of a tail fire is the lighter.** Fire is «вместо хода», so the lighter stays two sections
   behind and is the next rearmost; on noise turns (Г4/К) the chain of lighters ends in the Желоб at the
   slide (example logs: Остап/Тирна/Кея buried). The ev7 benchmark «Обычно огонь нужен на ходах 2 и 3» and
   «бережливый стол тратит два огня» ignore that lag (with three sledges and one free person the climb costs
   2 fires plus a bite or 3 fires).
4. **Exploit: unled mules as bait.** The pack goes to the rearmost section «с людьми или мулами», a mule
   without a leader stands, and a bite on a lone mule only removes the mule. One mule left on the Морена at
   turn 2 keeps the pack out of reach for the noise turns; spare mules left at the Площадка pin the pack for a
   turn each. With deliberate bait the unlearned thrifty table goes 91–95% → 100% (≈3.6 mules abandoned). Not
   a rule break, but it makes fire and the reveal unnecessary for any table with spare mules.
5. **Other exploits checked:** the pass cannot be repeated (pack gone); the White cannot be stalled past two
   Otrog fires (latest slide end of turn 7); spells give no speed, and Лечащее слово on the move makes NPC bites
   next to a cleric cost only a slot (by design). A hero rear guard who stays on the Морена and soaks bites
   (cut off alive, 1 undelivered) is legal and sometimes the best play.
6. **Real decisions per turn:** 1.2 (thrifty), 0.5–0.9 (average), 0 at 6 players for the unlearned wasteful
   table (every hand leads a mule or pulls the нарта; bites can only hit lone weakened NPCs) — that table
   watches the run. Decisions sit in turns 1–4; after the slide most turns are walking.
7. **Ambiguities that need a ruling (none flips an ending distribution by more than ~7 points):** the
   dm-card Otrog wording «зажжённый до хода, в котором Белая встала на К и стоит» vs run-know (arrival-turn fire
   works or not: thrifty learned 100 → 93%); whether the Otrog lighter is in his section for the pack; fire
   over the slide is lit in step 2 but she acts in step 1 («в этот ход»); whether her 11 damage to a buried
   hero repeats each turn and counts as a victim (three hits down a 31-hp fighter); a downed person on a mule
   (run-rules «человек — 2» vs dm-card «ослабевший или обмороженный»); what happens to the rider of a bitten
   mule; whether sledge mules need a separate leader; whether blowing the horn is an action.
8. **No dead state** in the rules: the slide always comes by turn 7, the run always ends by turn 10.
