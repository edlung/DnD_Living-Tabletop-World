# salt-meridian, evening 8: simulation of the round-2 text

I re-read the edited source: `encounters.json` chain-rock-battle, `handouts.json` strait-chart and
rock-sketch, `sessions-4.json` evening 8 and `world.json` truth/endings. I updated `sim.py` to that text
and generated the tables with `make_final.py`, which writes `results-final-tables.md` (400 seeded runs
per cell). I edited nothing in the campaign.

## What changed in the simulator (all from the text)

- At alarm 7+, Кречет's surrender stops «Тёрн» only. The flagship (led by the first mate) keeps taking
  two ships per turn until the end.
- Water drops one extra step only if a ship **stood in row 2 for the whole turn** without the signal.
- A patrol that arrives after the signal drifts like the others.
- At 9–10: «Сойка» sits aground at С3 and the shoal is shut until she drifts. She takes one ship that
  ends next to С3 and stays on the shoal. «Камбала» acts from turn 1.
- Table policy (stated, not from the text). Small ships wait in row 1, because they can cross from
  there. "Wait" crosses only free sets. The exception is chain crossings at 7+, which go in the last
  turn before the flagship acts. Otherwise "wait" and "rush" are as in `results.md`.

## Final table (passed: «Коридор» 4–5 / «Половина» 2–3 / «Закрыт» 0–1)

| Table                                | Players   | wait: К/П/З %, mean (p10–p90)     | rush: К/П/З %, mean    |
| ------------------------------------ | --------- | --------------------------------- | ---------------------- |
| quiet, alarm 0                       | 5         | 98/2/0, 4.20 (4–5)                | 100/0/0, 4.00          |
| quiet, alarm 0                       | 6 / 7 / 8 | 100/0/0, 4.51 / 4.58 / 4.62 (4–5) | 100/0/0, 4.00          |
| average, alarm 5                     | 5         | 100/0/0, 4.74 (4–5)               | 100/0/0, 4.00          |
| average, alarm 5                     | 6 / 7 / 8 | 100/0/0, 4.96–4.97 (5–5)          | 100/0/0, 4.01–4.02     |
| loud, alarm 8                        | 5         | 19/81/0, 3.16 (3–4)               | 0/100/0, 2.98          |
| loud, alarm 8                        | 6 / 7 / 8 | 54 / 57 / 62 % К, 3.52–3.59 (3–4) | 1–2/98–99/0, 2.99–3.02 |
| alarm 9 (journal shown) and alarm 10 | 5         | 0/95–96/4–5, 1.95 (2–2)           | 0/100/0, 2.00          |
| alarm 9 and alarm 10                 | 6–8       | 0/99–100/0–1, 2.00 (2–2)          | 0/100/0, 2.00          |

- **Кречет:** reaches 10 HP or less in round 3.0–4.8.
- **Signal:** goes up in round 1, or round 2 at 5 players.
- **Heroes:** none is ever taken or lost against the player's will. A hero holds the brake in the last turn
  in 0–10 % of runs, and Тар takes over every time. All heroes are out in 0 % of runs.
- **Pace:** 8.4–12.4 decisions per round.

**Alarm sweep, 6 players, wait.** The outcome now follows the alarm bands. Alarm 0–6 gives «Коридор» 100 %,
7–8 give 54 % «Коридор» and 46 % «Половина», and 9–10 give «Половина» 100 % (2 ships). A table that sends
no one to the mast gets «Закрыт» at 7+ and 0 ships at 9–10.

**What now decides 7–8.** «Коридор» needs Кречет to surrender by round 3. Then «Тёрн» drifts before the
last free turn (turn 3), and «Чаша» plus two small ships pass, with a third small ship over the shoal on
turn 4. Applying SRD Reckless raises this to 88 % «Коридор». Without class features it falls to 24 %.

**What fixes 9–10.** The flagship acts from turn 2 and catches everything that crosses the chain. Only
the small ships over the shoal get through. With the pact the shoal gives 3; without it, 2.

## Do the decisions read consistently?

Yes in the source: the encounter, `strait-chart`, scene 2 check, dmNote, consequences, truth and
endings all agree on the flagship at 7+, the water wording, late patrols, the aground «Сойка»,
«Камбала» from turn 1 at 9–10, `rock-sketch` sentries 2/3, and the evening-2 reef count of 1/1/1/2.

## Remaining problems

1. **Medium: the rendered pages are stale.** `handouts/strait-chart.html` still says «кончил ход в ряду 2».
   `maps.html` and `session-8.html` have no «старпом держит блокаду». Rebuild the package before play,
   because the DM and players use these pages.
2. **Low: the strait chart lost two lines.** `strait-chart` (source) dropped «Большим отмель закрыта»
   and «больше никак». Only «одно малое» implies the first rule. Scene 2 still carries the movement cap,
   but the player handout does not. Restore «большим — закрыта».
3. **Low, new ambiguity: does the aground «Сойка» take ships every turn?** The 9–10 dmNote says «Сойка …
   берёт одно судно … и остаётся на мели». It does not say whether that is one ship in total or one per
   turn. Effect: loud 6-player «Коридор» 54 % → 48 %; with no signal raised, 0 either way. Fix: «одно за
   прорыв».
4. **Low, new exploit: waiting costs no water if ships wait in row 1.** Small ships can cross from row 1,
   so the extra water drop now hits only big ships parked in row 2. A table that also holds the big
   ships in row 1 pays one turn of tempo instead of water. Acceptable.
5. **Low, a trap at 7–8.** Scene 2's choice «держать в ряду 2, пока … не сдался Кречет» loses big ships
   to the flagship after turn 3: rush gets 1 % «Коридор» and a well-timed wait gets 54 %. The alarm line
   read aloud tells the table the flagship's turn, so this is fair, but a dmNote hint helps: «при 7+ —
   через цепь до хода флагмана».
6. **Note: alarm 9–10 is fixed at 2 ships (3 with the pact)** whatever the table does, except skipping
   the mast. That fits «Коридор захлопнут».

## Verdict

The round-2 text is consistent and runnable, and the alarm now shapes the finale. A DM could run all
eight evenings next week once the HTML package is rebuilt. Fixes 2–3 are one line each.
