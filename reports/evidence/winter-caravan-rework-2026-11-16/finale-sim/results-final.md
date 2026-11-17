# winter-caravan — final run simulation after round 2 (2026-11-16)

Text simulated: `source/handouts.json` (run-rules, run-card, run-know, run-dm-card, run-dm-slide,
food-warmth-sheet), `source/sessions-4.json` evenings 7–8, `source/world.json` endings and truth, as of
commit 46be7c7a. Simulator: `sim.py` (`RULES` block), `tuned.py`, `final.py`; raw output
`results-final.json`. Reproduce: `python3 final.py 400 > results-final.json`.

## Rules as written now (what the simulator does)

- Endings count only people lost in the run (cut off, left on the slope, taken); 3+ or no hero at the fire
  → «Склон взял своё».
- Pack: −1, up to 3 sections toward the rearmost section with **people**; a mule without a leader goes down
  by itself. Tail fire holds it on 1–4 on d6 (pack one section behind), on 5–6 it «проходит огонь и кусает»
  (main reading: bites in the fire's section; alternative below: goes on to the next people). Sack always
  holds. A bite in the Желоб while the White is on Г4/К is noise → slide.
- Горло (8) entered only from 7; one Otrog fire per run; a fire lit in the turn she steps onto К delays,
  one lit while she stands does nothing; the Otrog lighter is not in his section that turn.
- Downed/weakened/frostbitten ride a led mule; a bitten mule's rider stays; sledge mules are led by the
  pullers; fire over the slide holds her at the next step 1; her 11 damage to a buried hero counts as one of
  her two victims.
- Policy as before (dawn plan chosen by dry run, greedy turns), plus: sack before fire on noise turns (sure
  vs 2/3), walkers wait on the Горло until the slide, heroes on the Горло dig out the buried.
- Площадка fight (not printed in the campaign; my assumption): P(Г1) 0.7 thrifty / 0.5 average / 0.3
  wasteful, same at 6/7/8; mule losses 0/1/2 with 0.6/0.3/0.1, 0.4/0.4/0.2, 0.3/0.5/0.2.

## Main result — 400 runs per cell

| стол           | знает    | игр. | цель ВУ | ВУ / ЧП / Склон % | дошли (p10–p90) | сани | решений/живой ход | Г1 % | ВУ при Г1 / Г2 |
| -------------- | -------- | ---- | ------- | ----------------- | --------------- | ---- | ----------------- | ---- | -------------- |
| бережливый     | знает    | 6    | 75–95   | 92 / 0 / 8        | 12.5 (13–13)    | 0.72 | 1.41              | 72   | 100 / 69       |
| бережливый     | знает    | 7    | 75–95   | 89 / 0 / 10       | 13.4 (10–14)    | 0.67 | 1.38              | 66   | 100 / 68       |
| бережливый     | знает    | 8    | 75–95   | 92 / 0 / 8        | 14.6 (15–15)    | 0.68 | 1.41              | 68   | 100 / 76       |
| бережливый     | не знает | 6    | 45–70   | 70 / 0 / 30       | 11.3 (7–13)     | 0.00 | 1.05              | 70   | 100 / 0        |
| бережливый     | не знает | 7    | 45–70   | 71 / 0 / 29       | 12.5 (8–14)     | 0.00 | 1.10              | 71   | 100 / 0        |
| бережливый     | не знает | 8    | 45–70   | 66 / 0 / 34       | 13.2 (9–15)     | 0.00 | 1.15              | 66   | 100 / 0        |
| средний        | знает    | 6    | 35–60   | 48 / 52 / 0       | 11.5 (11–12)    | 0.00 | 0.46              | 48   | 100 / 0        |
| средний        | знает    | 7    | 35–60   | 46 / 54 / 0       | 12.5 (12–13)    | 0.00 | 0.48              | 46   | 100 / 0        |
| средний        | знает    | 8    | 35–60   | 51 / 49 / 0       | 13.5 (13–14)    | 0.00 | 0.46              | 51   | 100 / 0        |
| средний        | не знает | 6    | 15–40   | 27 / 0 / 73       | 8.0 (5–12)      | 0.00 | 0.94              | 51   | 52 / 0         |
| средний        | не знает | 7    | 15–40   | 25 / 0 / 74       | 8.9 (6–13)      | 0.00 | 0.87              | 51   | 50 / 0         |
| средний        | не знает | 8    | 15–40   | 23 / 0 / 77       | 9.8 (7–14)      | 0.00 | 0.90              | 54   | 44 / 0         |
| расточительный | знает    | 6    | ≤20     | 0 / 8 / 92        | 9.0 (6–10)      | 0.00 | 0.42              | 27   | 0 / 0          |
| расточительный | знает    | 7    | ≤20     | 0 / 28 / 72       | 11.1 (10–12)    | 0.00 | 0.51              | 34   | 0 / 0          |
| расточительный | знает    | 8    | ≤20     | 0 / 26 / 74       | 12.0 (11–13)    | 0.00 | 0.51              | 32   | 0 / 0          |
| расточительный | не знает | 6    | ≤20     | 0 / 8 / 92        | 7.0 (5–10)      | 0.00 | 0.40              | 26   | 0 / 0          |
| расточительный | не знает | 7    | ≤20     | 0 / 7 / 93        | 8.0 (6–11)      | 0.00 | 0.39              | 29   | 0 / 0          |
| расточительный | не знает | 8    | ≤20     | 0 / 7 / 93        | 8.7 (6–12)      | 0.00 | 0.40              | 27   | 0 / 0          |

All «Вся упряжь» bands are met under the assumed fight odds (thrifty unlearned at 7 players 71%, on the
edge). Not met: decisions per live turn ≥ 1 for the average table (learned 0.46–0.48, unlearned
0.87–0.94) and the wasteful table (0.39–0.51); the wasteful split is weak at 6 players (8% «Через
перевал») and for unlearned 7–8 players (7%).

## Sensitivity (200 runs per cell)

«На 5–6 проходит огонь и кусает» read as «goes past the fire and bites the next people»:

| стол           | знает    | ВУ % (6/7/8) | ЧП %     | Склон %  |
| -------------- | -------- | ------------ | -------- | -------- |
| бережливый     | знает    | 90/88/90     | 0/0/0    | 9/11/10  |
| бережливый     | не знает | 72/74/69     | 0/0/0    | 28/26/31 |
| средний        | знает    | 34/31/38     | 54/54/51 | 12/16/12 |
| средний        | не знает | 34/35/38     | 0/2/2    | 66/64/60 |
| расточительный | знает    | 0/0/0        | 6/28/29  | 94/72/71 |
| расточительный | не знает | 0/0/0        | 10/8/6   | 90/92/94 |

Площадка fight P(Г1) = 0.9 for every table (first estimate for six level-3 heroes against AC 13 and 38 hp
in four rounds):

| стол           | знает    | ВУ % (6/7/8) | ЧП %     | Склон %  |
| -------------- | -------- | ------------ | -------- | -------- |
| бережливый     | знает    | 98/95/98     | 0/0/0    | 2/5/2    |
| бережливый     | не знает | 92/91/92     | 0/0/0    | 8/9/8    |
| средний        | знает    | 90/90/88     | 10/10/12 | 0/0/0    |
| средний        | не знает | 42/44/42     | 0/0/0    | 58/56/58 |
| расточительный | знает    | 0/0/0        | 22/28/29 | 78/72/71 |
| расточительный | не знает | 0/0/0        | 26/25/24 | 74/75/76 |

Otrog fire «шагнула на К» read as «does nothing» (the round-1 dm-card wording): no material change
(thrifty learned 89–94%, average learned 50–52%).

## Findings

1. **The run now decides only part of the field.** Given the start mark, the die matters for average
   unlearned (ВУ at Г1 ≈ 44–53%) and thrifty learned at Г2 (68–76%); every other non-wasteful cell is still
   100% at Г1 and 0% at Г2. Learned tables pass the pack on turn 1, which removes the die; thrifty
   unlearned covers both noise turns with its two sacks. The bands hold because P(Г1) is 0.7/0.5; at 0.9
   thrifty unlearned is 91–92% and average learned 88–90% (out of band). The Площадка odds are the
   remaining coin and are not validated.
2. **Ambiguity: where the failed fire bites.** run-rules, run-dm-card, evening 8 «на 5–6 она проходит
   огонь и кусает» vs evening 7 «на 5–6 или без огня и мешка — укус … в этом участке». Reading «past the
   fire» moves average learned from 46–51% to 31–38% and average unlearned from 23–27% to 34–38%. Fix:
   «на 5–6 стая кусает в участке огня и стоит там».
3. **Ambiguity: "more fires reduce the risk"** (round-2 decision 5) has no mechanism in the text: two
   fires in one section, or fire plus sack, are not described. One line in run-rules: «В участке один
   огонь за ход» (or «второй огонь — второй бросок к6»).
4. **Ending vs the Площадка.** world.json `endings[0].requires` «все, кто вышел в бег с Последней
   Площадки» vs run-dm-slide «Отрезаны — кто на 0–3 … потеряны в беге»: a frostbitten NPC left on the
   Площадка at dawn is counted lost by the slide card but arguably «did not go out» by the ending text.
   Fix: «все, кто был на Площадке на рассвете дня 8».
5. **Mild exploit from (a):** whoever asks to stay at Явра on evening-7 morning now costs nothing at the
   end (session 7 scene 1 «исход не меняет»), so a table at Еда 1–2 gains by not persuading him (one mouth
   and one rider fewer). Intended by (a); worth one line for the DM.
6. **Decisions:** the wasteful table at 6 players still has no free hand (every hero leads a mule or
   pulls the нарта, no fire); the learned average table, after passing the pack, only walks.

## Round-2 decisions check (15)

All 15 read consistently in the edited sources: (1) endings in world.json, run-dm-slide, evening 8 and
the evening-7 consequence; (2) «мул без ведущего уходит вниз сам» in run-rules, run-dm-card, evenings 7–8,
world tableGuidance and scaling; (3) Горло from 7 in run-rules, run-card, run-dm-card, evening 8; (4) one
Otrog fire in run-know, run-dm-card, evening 8, truth; (5) the die in run-rules, run-dm-card, evenings
7–8, world; (6) evening-7 sledge choice; (7) «вместо хода — стоишь на месте»; (8) Otrog timing and lighter
in run-know and run-dm-card; (9)–(10) run-dm-slide; (11) run-rules and run-dm-card; (12) one Слабость
wording in run-rules, the sheet and evening 8 (evening 1 keeps «только помеха…», same meaning); (13)
evening-7 benchmark, truth «Плата», README; (14) genre and players.html; (15) passing-pack. The rendered
HTML (handouts, session-8, players) carries the new text; no «без ведущего стоит» or «не больше двух»
remains.
