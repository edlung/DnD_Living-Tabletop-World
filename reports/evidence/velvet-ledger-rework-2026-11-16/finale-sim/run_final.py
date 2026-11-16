#!/usr/bin/env python3
"""Last bell as written after round 2 (bell-rules/bell-card/sessions-4 of 2026-11-16 12:35).
Text → simulator: Сделка СЛ 15, К +3, предел 6 (с «Сурьма покупает»); строка сама Курс не снижает (Павел −1 остаётся,
Арсений/Ева без пользы); R1 Заслон против Руки — СЛ 12; R2 ход Книги в ударе Руки в силе, молчит следующий удар,
возврат через один; проданный судья держит до начала 12-го; R3 Аскар вне предела; R4 порванная бумага — судья
«на крючке»; R5 строка Ольги тратится на ближайшую Руку; R6 пока колокольчик у судьи, Рука ничего не делает.
Usage: python3 run_final.py [N] > results-final.md"""
import sys
from bell_sim import simulate, pct
from tune_eval import run
TEXT = dict(line_kd=0, deal_dc=15, deal_limit=6, plan_aware=True)   # plan_aware: policy fix, see note          # BASE in tune_search adds R2 + sold-judge return
N = int(sys.argv[1]) if len(sys.argv) > 1 else 400
print('# Last bell as written after round 2 — Перевёртыш / Свой порог / С молотка, %\n')
print('Policy note: results-tuned.md used a greedy policy whose Курс projection ignored its own planned cancels; with\n'
      'lines no longer lowering Курс it never opened finale shorts, and the middle table looked like 43–50 %. With the\n'
      'projection fixed (`plan_aware`) the greedy table opens its shorts at once, like the naive table, and wins far more.\n')
out = run(TEXT, N)
from tune_search import BASE
A = dict(BASE, **TEXT)
E = ('Перевёртыш', 'Свой порог', 'С молотка')
print('\n## Naive (reactive) table\n\n| старт | 6 | 7 | 8 |\n|---|---|---|---|')
for t in ('осторожный', 'средний', 'рискованный', 'небрежный', 'удачливый'):
    print(f'| {t} | ' + ' | '.join('/'.join(f"{pct(simulate(t, s, N, amb=dict(A, naive=True)), k):.0f}" for k in E) for s in (6, 7, 8)) + ' |')
print('\n## Extra checks (size 6)\n')
for lab, name, kw in [('средний, продал колокольчик', 'средний, продал колокольчик', {}),
                      ('средний, ярлык срезан ночью', 'средний', dict(cut_tag=True)),
                      ('средний, утро «держу»', 'средний', dict(amb=dict(A, morning='hold'))),
                      ('средний, без пересадки', 'средний', dict(amb=dict(A, reseat=False)))]:
    a = kw.pop('amb', A)
    r = simulate(name, 6, N, amb=a, **kw); print(f"- {lab}: " + '/'.join(f'{pct(r, k):.0f}' for k in E) + f", запас p50 {r['p50']:+.0f}")
r = simulate('средний', 6, N, amb=A)
print('\nMean uses per bell, middle, 6: ' + ', '.join(f'{k} {v / N:.2f}' for k, v in sorted(r['logs'].items())))
print(f"Курс = 1 at stroke 12: {100 * r['kd1']:.0f}%; positions {r['posgain']:.1f}/{r['posmax']:.0f}; margin p10/p50/p90 {r['p10']:+.0f}/{r['p50']:+.0f}/{r['p90']:+.0f}")

FIX = dict(TEXT, deal_gain=2)
print('\n# Proposed correction: «Сделка — СЛ 15, К +2 (6)» on top of the round-2 text\n')
run(FIX, N)
B = dict(A, deal_gain=2)
print('\n## Naive (reactive) table, correction\n\n| старт | 6 | 7 | 8 |\n|---|---|---|---|')
for t in ('осторожный', 'средний', 'рискованный', 'небрежный', 'удачливый'):
    print(f'| {t} | ' + ' | '.join('/'.join(f"{pct(simulate(t, s, N, amb=dict(B, naive=True)), k):.0f}" for k in E) for s in (6, 7, 8)) + ' |')
