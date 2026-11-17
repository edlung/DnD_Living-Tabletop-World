#!/usr/bin/env python3
"""Evaluate one lever set against the coordinator's targets. Usage: python3 tune_eval.py N 'dict(...)'"""
import sys
from bell_sim import simulate, pct, STARTS
from tune_search import BASE
E = ('Перевёртыш', 'Свой порог', 'С молотка')
ALLY = {'судья': ('ally_judge',), 'Инга': ('ally_inga',), 'Ная': ('ally_naya',), 'Аскар': ('ally_askar',), 'Сурьма': ('ally_surma',)}
TABLES = ('осторожный', 'средний', 'рискованный', 'небрежный', 'удачливый')

def run(a, N, verbose=True):
    A = dict(BASE, **a); out = {}
    print(f'Levers: {a}\n')
    print('| старт | 6 | 7 | 8 | запас p50 (6) |\n|---|---|---|---|---|')
    for t in TABLES:
        cells = []
        for s in (6, 7, 8):
            r = simulate(t, s, N, amb=A); out[(t, s)] = r
            cells.append('/'.join(f'{pct(r, k):.0f}' for k in E))
        print(f"| {t} | " + ' | '.join(cells) + f" | {out[(t, 6)]['p50']:+.0f} |")
    base = pct(out[('средний', 6)], E[0])
    pol = pct(simulate('средний', 6, N, amb=A, off=('rumor', 'zaslon')), E[0])
    print(f'\nСредний, 6: без Слуха/Шёпота/Заслона {pol:.0f}% (было {base:.0f}%, Δ {base - pol:+.0f})')
    print('\nКачание от одного союзника (Перевёртыш, размер 6), max |Δ| по столам:')
    for name, off in ALLY.items():
        sw = []
        for t in TABLES:
            b = pct(out[(t, 6)], E[0]); w = pct(simulate(t, 6, N, amb=A, off=off), E[0]); sw.append((abs(b - w), t))
        print(f'  {name}: {max(sw)[0]:.0f} ({max(sw)[1]})')
    print('\nОдна стойка или один вид хода (средний, 6, покрыт %):')
    for lab, off in [('только Касса', ('lines', 'zvon', 'rumor', 'zaslon', 'open', 'ally')),
                     ('только Книга', ('deal', 'golos', 'ponizu', 'rumor', 'zaslon', 'open', 'ally')),
                     ('только Пол', ('deal', 'golos', 'ponizu', 'lines', 'zvon', 'ally')),
                     ('без Открытий', ('open',))]:
        r = simulate('средний', 6, N, amb=A, off=off); print(f'  {lab}: {100 - pct(r, E[2]):.0f}')
    return out

if __name__ == '__main__':
    run(eval(sys.argv[2]) if len(sys.argv) > 2 else {}, int(sys.argv[1]) if len(sys.argv) > 1 else 200)
