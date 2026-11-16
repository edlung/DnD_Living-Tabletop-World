#!/usr/bin/env python3
"""Runs bell_sim.py over all starting states, sizes, ambiguity readings, ablations and what-ifs.
Usage: python3 run_report.py [N=400] > results.md"""
import sys, statistics
from bell_sim import simulate, STARTS, pct

N = int(sys.argv[1]) if len(sys.argv) > 1 else 400
E = ('Перевёртыш', 'Свой порог', 'С молотка')
tri = lambda r: '/'.join(f'{pct(r, k):.0f}' for k in E)

print(f'# Последний колокол — Monte-Carlo, N={N} bells per cell\n')
print('Cells: Перевёртыш / Свой порог / С молотка in %. Default readings (see bell_sim.AMB), greedy planning policy.\n')
print('| старт | игроков | разрыв после утра | Перевёртыш | Свой порог | С молотка | запас p10/p50/p90 | ярлык сорван | Курс=1 к 12-му | позиции, получено/макс | решений/удар | бросков/удар |')
print('|---|---|---|---|---|---|---|---|---|---|---|---|')
for name in STARTS:
    for size in (6, 7, 8):
        r = simulate(name, size, N)
        dec = statistics.mean(d for d, _ in r['load']); rol = statistics.mean(x for _, x in r['load'])
        print(f"| {name} | {size} | {r['gap0']}{' Молоток' if r['molotok'] else ''} | {pct(r, E[0]):.0f}% | {pct(r, E[1]):.0f}% | "
              f"{pct(r, E[2]):.0f}% | {r['p10']:+.0f}/{r['p50']:+.0f}/{r['p90']:+.0f} | {r['logs']['torn'] / N:.2f} | "
              f"{100 * r['kd1']:.0f}% | {r['posgain']:.1f}/{r['posmax']:.0f} | {dec:.1f} | {rol:.1f} |")

print('\n# Naive (reactive) table: cancels on first chance, lines in list order, shorts at once\n')
print('| старт | 6 | 7 | 8 |\n|---|---|---|---|')
for name in STARTS:
    print(f'| {name} | ' + ' | '.join(tri(simulate(name, s, N, amb=dict(naive=True))) for s in (6, 7, 8)) + ' |')

print('\n# Ambiguity sensitivity (size 6)\n')
flips = [('по умолчанию', {}),
         ('A1 Заслон против Руки без броска', dict(screen_vs_hand_auto=True)),
         ('A2 Книга сохраняет свой ход в ударе 4/10', dict(hand_voids_book_now=False)),
         ('A3 Слух Аскара тратит предел 5', dict(askar_uses_limit=True)),
         ('A4 порванная бумага = судья отпущен', dict(torn_paper_releases=True)),
         ('A5 строка того же удара не снижает Опровержение', dict(refut_counts_same_stroke=False)),
         ('A6 утро «беру 3»', dict(morning='beru')), ('A6 утро «держу»', dict(morning='hold')),
         ('A6 утро молчание', dict(morning='silent')), ('A7 без пересадки', dict(reseat=False)),
         ('A8 Рука при изъятом проданным судьёй Ключе — ничего', dict(no_key_hand_is_surcharge=False)),
         ('A9 строка Ольги переживает уже отбитую Руку', dict(olga_carries=True))]
names = ('осторожный', 'средний', 'рискованный', 'небрежный')
print('| чтение | ' + ' | '.join(names) + ' |\n|---|---|---|---|---|')
for lab, a in flips:
    print(f'| {lab} | ' + ' | '.join(tri(simulate(n, 6, N, amb=a)) for n in names) + ' |')

print('\n# Ablation, middle table, size 6 (policy greedy)\n')
print('| убрано | покрыт % | Перевёртыш % | медиана запаса |\n|---|---|---|---|')
ALL_ALLIES = ('ally', 'ally_judge', 'ally_inga', 'ally_naya', 'ally_surma', 'ally_askar')
for lab, off in [('ничего', ()), ('Сделка', ('deal',)), ('Голос артели', ('golos',)), ('Звон', ('zvon',)),
                 ('Заслон', ('zaslon',)), ('Открытие', ('open',)), ('Слух/Шёпот', ('rumor',)), ('чтение строк', ('lines',)),
                 ('все союзники', ALL_ALLIES), ('судья', ('ally_judge',)), ('Инга', ('ally_inga',)), ('Аскар', ('ally_askar',)),
                 ('Сурьма', ('ally_surma',)), ('По низу', ('ponizu',)), ('все броски', ('deal', 'rumor', 'zaslon'))]:
    r = simulate('средний', 6, N, off=off)
    print(f"| {lab} | {100 - pct(r, E[2]):.0f} | {pct(r, E[0]):.0f} | {r['p50']:+.0f} |")

print('\n# Gap sweep: middle-table resources, Долг shifted (size 6) — where does the bell decide?\n')
print('| разрыв после утра | greedy П/С/М | naive П/С/М | fix «Сделка (5), К +2» greedy |\n|---|---|---|---|')
for sh in (-12, -8, -4, 0, 2, 4, 6, 8, 12):
    g = simulate('средний', 6, N, amb=dict(d_shift=sh)); nv = simulate('средний', 6, N, amb=dict(d_shift=sh, naive=True))
    fx = simulate('средний', 6, N, amb=dict(d_shift=sh, deal_limit=5, deal_gain=2))
    print(f"| {g['gap0']} | {tri(g)} | {tri(nv)} | {tri(fx)} |")

print('\n# Fix candidates (size 6, greedy / naive)\n')
print('| вариант | осторожный | средний | рискованный |\n|---|---|---|---|')
for lab, a in [('как в тексте', {}), ('Сделка предел 4', dict(deal_limit=4)), ('Сделка К +2', dict(deal_gain=2)),
               ('Сделка предел 4 и К +2', dict(deal_limit=4, deal_gain=2)), ('Сделка СЛ 15', dict(deal_dc=15)),
               ('каждая Надбавка +1', dict(nadb_plus=1)), ('каждая Надбавка +2', dict(nadb_plus=2)),
               ('Сделка предел 5 и Надбавка +1', dict(deal_limit=5, nadb_plus=1)),
               ('Сделка предел 5 и К +2', dict(deal_limit=5, deal_gain=2))]:
    cells = []
    for n in ('осторожный', 'средний', 'рискованный'):
        cells.append(tri(simulate(n, 6, N, amb=a)) + ' / ' + tri(simulate(n, 6, N, amb=dict(a, naive=True))))
    print(f'| {lab} | ' + ' | '.join(cells) + ' |')

r = simulate('средний', 6, N)
print('\n# Mean uses per bell, middle table, size 6\n')
print(', '.join(f'{k} {v / N:.2f}' for k, v in sorted(r['logs'].items())))
r = simulate('средний', 6, N, cut_tag=True)
print(f"\nMiddle table, tag cut at night (Долг +2 in the morning): {tri(r)}")
