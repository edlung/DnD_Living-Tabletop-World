#!/usr/bin/env python3
"""Turns results.json (from sim.py) into results.md."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(HERE, 'results.json')))
A = {'cautious': 'осторожный (9)', 'middle': 'средний (17)', 'noisy': 'шумный (20)'}

def row(c, extra=''):
    return (f"| {A[c['arch']]} | {'да' if c['key'] else 'нет'} | {c['n']} | {c['top']:.0f} | {c['mid']:.0f} | {c['bad']:.0f} | "
            f"{c['mean']:.1f} ({c['p10']}–{c['p90']}) | {c['minO']}–{c['maxO']} | {c['hero_lost']:.0f} | {c['irina']:.0f} | "
            f"{c['pulled']:.2f} | {c['gk_down']:.0f} |{extra}")

HDR = ("| старт 06:00 | ключ | игроков | «Больше, чем он съел» % | «Сколько унесли» % | «Дом сыт» % | "
       "О среднее (p10–p90) | О min–max | герой потерян % | Ирина вышла % | вырвано и вышло | Привратник ≤18 % |\n"
       "|---|---|---|---|---|---|---|---|---|---|---|---|")

L = []
L.append(open(os.path.join(HERE, 'results-head.md')).read())
L.append('\n## 1. Главная таблица (чтения по умолчанию, 400 бегств на клетку)\n')
L.append(HDR)
for c in d['main']: L.append(row(c))
L.append('\n## 2. Решения за раунд (среднее по раундам бегства, 6 игроков)\n')
L.append('| старт | ключ | ходов отрядов (сгруппированных) | действий | бонусных | итого решений стола | разрешений ведущего | бросков за раунд | раундов |\n|---|---|---|---|---|---|---|---|---|')
for c in d['main']:
    if c['n'] != 6: continue
    p = c['per_round']; tot = p['units'] + p['act'] + p['bonus']
    rolls = c['stats'].get('rolls', 0) / max(1, c['rounds'])
    L.append(f"| {A[c['arch']]} | {'да' if c['key'] else 'нет'} | {p['units']:.1f} | {p['act']:.1f} | {p['bonus']:.1f} | {tot:.1f} | {p['dm']:.1f} | {rolls:.1f} | {c['rounds']:.1f} |")
L.append('\n## 3. Двусмысленности: второе чтение (6 игроков)\n')
for name, cells in d['sens'].items():
    L.append(f'\n**{name}**\n'); L.append(HDR)
    for c in cells: L.append(row(c))
L.append('\n## 4. Проверка эксплойтов и правил, решающих исход (6 игроков)\n')
for name, cells in d['exploit'].items():
    L.append(f'\n**{name}**\n'); L.append(HDR)
    for c in cells: L.append(row(c))
L.append('\n## 5. Запас свечей в 06:00 (не напечатан в кампании), 6 игроков, без свечей Урмов\n')
L.append('| старт | ключ | запасных | top % | mid % | bad % | О среднее (p10–p90) | герой потерян % |\n|---|---|---|---|---|---|---|---|')
for c in d['candles']:
    L.append(f"| {A[c['arch']]} | {'да' if c['key'] else 'нет'} | {c['spares']} | {c['top']:.0f} | {c['mid']:.0f} | {c['bad']:.0f} | {c['mean']:.1f} ({c['p10']}–{c['p90']}) | {c['hero_lost']:.0f} |")
L.append('\n## 6. Кто выходит «не собой» (главная таблица, 6 игроков)\n')
for c in d['main']:
    if c['n'] == 6:
        L.append(f"- {A[c['arch']]}, ключ {'да' if c['key'] else 'нет'}: " + ', '.join(f'{k} {v / 4:.0f}%' for k, v in c['nn']))
L.append(open(os.path.join(HERE, 'results-tail.md')).read())
open(os.path.join(HERE, 'results.md'), 'w').write('\n'.join(L) + '\n')
print('results.md written')
