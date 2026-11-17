"""Build results.md from results.json (output of gate_sim.py)."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, 'results.json')))

def pc(r, key):
    return round(100 * sum(v for k, v in r['outcomes'].items() if key in k) / r['runs'], 1)

def row(r):
    w = r['why']; n = r['runs']
    tear = round(100 * w.get('знамя сорвано', 0) / n)
    fell = round(100 * w.get('Сайр упал', 0) / n)
    wd = round(100 * (w.get('Сайр отошёл', 0) + w.get('Сайр сдался', 0)) / n)
    r8 = round(100 * w.get('раунд 8', 0) / n)
    return (f"| {r['label']} | {r['table']} | {r['n']} | {pc(r, 'Венец')} | {pc(r, 'Соседи')} | {pc(r, 'Квартал')} | "
            f"{pc(r, 'Рабочие')} | {pc(r, 'Уход')} | {pc(r, 'Пощада')} | {r['mean_rounds']} ({r['p10']}–{r['p90']}) | "
            f"{round(100 * r['any_drop'])} | {tear}/{fell}/{wd}/{r8} | {r['stair_emptied']} | "
            f"{r['hero_decisions_per_round']} / {r['foe_turns_per_round']} / {r['dm_steps_per_round']} |")

HEAD = ("| Прогон | Стол | Игр. | Победа % | цена Соседи | цена Квартал | цена Рабочие | Уход % | Пощада % | "
        "Раунды ср. (p10–p90) | Герой упал, % боёв | Конец: срыв/упал/отход-сдача/р8, % | Ступень освобождена носилками, на бой | "
        "Решений героев / ходов врагов / шагов ведущего за раунд |\n|" + "---|" * 14)

def table(pred):
    return HEAD + "\n" + "\n".join(row(r) for r in R if pred(r))

def tmin(r):  # minutes: hero turn 1.5, foe figure 0.5, DM procedure step 0.5
    per = r['n'] * 1.5 + r['foe_turns_per_round'] * 0.5 + r['dm_steps_per_round'] * 0.5
    return round(per), round(per * r['mean_rounds'])

base = [r for r in R if r['label'].startswith('A ')]
times = "\n".join(f"| {r['table']} | {r['n']} | ~{tmin(r)[0]} | ~{tmin(r)[1]} |" for r in base)

md = open(os.path.join(HERE, 'results_narrative.md')).read()
md = md.replace('{{BASE}}', table(lambda r: r['label'].startswith('A ')))
md = md.replace('{{READINGS}}', table(lambda r: r['label'][0] in 'BCDEFGHIJKLMNO'))
md = md.replace('{{FIXES}}', table(lambda r: r['label'][0] == 'X'))
md = md.replace('{{TIMES}}', "| Стол | Игр. | мин/раунд | мин/бой |\n|---|---|---|---|\n" + times)
open(os.path.join(HERE, 'results.md'), 'w').write(md)
print('results.md written')
