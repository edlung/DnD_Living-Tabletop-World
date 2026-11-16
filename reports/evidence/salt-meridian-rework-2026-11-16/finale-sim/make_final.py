"""Round-2 text (sm-round2-decisions.md) -> results-final-tables.md.  python3 make_final.py"""
import sim
FINAL = dict(R_drop='held', R_late='flags_stay', fix='mate', R_aground='spent', reckless=False)
def s_(o): return sim.summarize(sim.cell(o, runs=400, seed=29))
out = ['| table | policy | players | Коридор / Половина / Закрыт % | passed mean (p10–p90) | Кречет out % @ rd | signal % @ rd | hero down % | Тар down % | hero holds last turn % | all out % | water −1 % | dec/rd |', '|' + '---|' * 13]
TAB = dict(sim.TABLES)
TAB['коридор захлопнут (10, вражда, азбука, Инне не показали)'] = dict(alarm=10, inna='none', reef='hostile', book=False)
TAB['9 (нейтралитет, азбука, Инна видела)'] = dict(alarm=9, inna='shown', reef='neutral', book=False)
for name, t in TAB.items():
    for pol in ('wait', 'rush'):
        for n in (5, 6, 7, 8):
            o = dict(FINAL); o.update(t); o.update(players=n, policy=pol); s = s_(o)
            out.append(f"| {name} | {pol} | {n} | {s['corr']:.0f} / {s['half']:.0f} / {s['closed']:.0f} | {s['mean']:.2f} ({s['p10']}–{s['p90']}) | {s['boss']:.0f} @ {s['boss_rd']:.1f} | {s['sig']:.0f} @ {s['sig_rd']:.1f} | {s['anydown']:.0f} | {s['tar_down']:.0f} | {s['hero_holder']:.0f} | {s['allout']:.0f} | {s['drop']:.0f} | {s['dec']:.1f} |")
out += ['', '### Sensitivity at 6 players (round-2 text)', '', '| variant | quiet | average | loud | alarm 10 |', '|---|---|---|---|---|']
V = [('baseline wait', {}), ('rush', dict(policy='rush')), ('no one to the mast', dict(mast=False)),
     ('adds first', dict(focus='adds')), ('no class features', dict(features=False)), ('SRD Reckless on', dict(reckless=True)),
     ('weak: rush+adds+no features', dict(policy='rush', focus='adds', features=False)),
     ('R: aground «Сойка» takes every turn', dict(R_aground='stays')), ('R: aground «Сойка», no mast, takes every turn', dict(R_aground='stays', mast=False)),
     ('R: late patrol needs a new signal', dict(R_late='present_only')), ('R: Тар body blocks J2', dict(R_tarbody='drag')),
     ('journal given to Инна', dict(inna='given'))]
cols = [sim.TABLES[k] for k in sim.TABLES] + [dict(alarm=10, inna='none', reef='hostile', book=False)]
for vn, ov in V:
    cells = []
    for t in cols:
        o = dict(FINAL); o.update(t); o.update(players=6); o.update(ov); s = s_(o)
        cells.append(f"{s['corr']:.0f}/{s['half']:.0f}/{s['closed']:.0f} μ{s['mean']:.2f}")
    out.append(f"| {vn} | " + ' | '.join(cells) + ' |')
out += ['', '### Alarm sweep, 6 players (Инне не показали, нейтралитет, азбука)', '', '| alarm | wait | rush | no mast |', '|---|---|---|---|']
for a in range(11):
    b = dict(FINAL, players=6, alarm=a, inna='none', reef='neutral', book=False)
    r = [s_(dict(b)), s_(dict(b, policy='rush')), s_(dict(b, mast=False))]
    out.append(f"| {a} | " + ' | '.join(f"{x['corr']:.0f}/{x['half']:.0f}/{x['closed']:.0f} μ{x['mean']:.2f}" for x in r) + ' |')
open('results-final-tables.md', 'w').write('# Round-2 text, generated tables (400 runs per cell)\n\n' + '\n'.join(out) + '\n')
print('\n'.join(out))
