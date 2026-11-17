#!/usr/bin/env python3
"""Format results.json into Markdown tables (used for results.md)."""
import json, sys
r = json.load(open(sys.argv[1] if len(sys.argv) > 1 else 'results.json'))
RU = {'thrifty': 'бережливый', 'average': 'средний', 'wasteful': 'расточительный', 'learned': 'знает', 'unlearned': 'не знает'}
def row(k, v):
    kind, l, h = k.split('|'); e = v['endings']
    return (f"| {RU[kind]} | {RU[l]} | {h} | {e['Вся упряжь']:.0f} | {e['Через перевал']:.0f} | {e['Склон взял своё']:.0f} | "
            f"{v['arrived_mean']:.1f} ({v['arrived_p10']:.0f}–{v['arrived_p90']:.0f}) | {v['sledges_mean']:.2f} | {v['cargo_mean']:.1f} | "
            f"{v['fire_used']:.1f} | {v['slide_turn']:.1f} | {v['G1']:.0f} | {v['decisions_per_turn']:.2f} / {v['zero_decision_turns']:.0f}% |")
H = ("| стол | Отрог+пропуск | игроков | Вся упряжь % | Через перевал % | Склон % | дошли, среднее (p10–p90) | сани | ящики+тюки | огня | ход схода | старт Г1 % | решений/ход / ходов без решений |\n"
     "|---|---|---|---|---|---|---|---|---|---|---|---|---|")
print('### main\n'); print(H)
for k, v in r['main'].items(): print(row(k, v))
print('\n### fixed\n')
print('| старт | стол | знает | Вся упряжь % | Через перевал % | Склон % | дошли | сани | план |\n|---|---|---|---|---|---|---|---|---|')
for fk, g in r['fixed'].items():
    for k, v in g.items():
        kind, l, h = k.split('|'); e = v['endings']
        print(f"| {fk} | {RU[kind]} | {RU[l]} | {e['Вся упряжь']:.0f} | {e['Через перевал']:.0f} | {e['Склон взял своё']:.0f} | {v['arrived_mean']:.1f} | {v['sledges_mean']:.1f} | {'; '.join(v['plans'])} |")
def agg(g):
    out = {}
    for k, v in g.items():
        kind, l, h = k.split('|'); a = out.setdefault((kind, l), [0.0] * 5); e = v['endings']
        for i, x in enumerate([e['Вся упряжь'], e['Через перевал'], e['Склон взял своё'], v['sledges_mean'], v['mules_bitten']]):
            a[i] += x / 3
    return out
base = agg(r['main'])
print('\n### readings\n')
print('| вариант | стол | знает | Вся упряжь % (Δ) | Через перевал % (Δ) | Склон % (Δ) | сани (Δ) | мулов-приманок |\n|---|---|---|---|---|---|---|---|')
for name, g in [('приманка-мул (эксплойт)', r['exploit_decoy'])] + list(r['flips'].items()):
    for (kind, l), a in agg(g).items():
        b = base[(kind, l)]
        print(f"| {name} | {RU[kind]} | {RU[l]} | " + ' | '.join(f"{x:.0f} ({x - y:+.0f})" for x, y in zip(a[:3], b[:3])) + f" | {a[3]:.2f} ({a[3]-b[3]:+.2f}) | {a[4]:.1f} |")
print('\n### examples\n')
for k, v in r['examples'].items():
    print(f"**{k}** — план {v['plan']}: {v['ending']}, недошедших {v['undelivered']}, дошли {v['arrived']}.  ")
    print('  ' + '; '.join(v['log']) + '\n')
