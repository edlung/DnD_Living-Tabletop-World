"""Regenerates results-tables.md (all numbers quoted in results.md).  python3 make_results.py"""
import io, contextlib, sim, variants, sweep
buf = io.StringIO()
p = lambda *a: print(*a, file=buf)
p('# Finale sim — generated tables (400 runs per cell, seeded)\n')
p('## Main grid (text-faithful baseline: Кречет as printed, no Reckless; class features on)\n')
p('| table | policy | players | Коридор / Половина / Закрыт % | passed mean (p10–p90) | Кречет ≤10 HP % @ round | signal % @ round | any hero down % | Тар down % | hero holds brake in last turn % | all heroes out % | water −1 extra % | decisions / round | rounds |')
p('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
for name, t in sim.TABLES.items():
    for pol in ('rush', 'wait'):
        for n in (5, 6, 7, 8):
            o = dict(t); o.update(players=n, policy=pol)
            s = sim.summarize(sim.cell(o, runs=400))
            p(f"| {name} | {pol} | {n} | {s['corr']:.0f} / {s['half']:.0f} / {s['closed']:.0f} | {s['mean']:.2f} ({s['p10']}–{s['p90']}) | "
              f"{s['boss']:.0f} @ {s['boss_rd']:.1f} | {s['sig']:.0f} @ {s['sig_rd']:.1f} | {s['anydown']:.0f} | {s['tar_down']:.0f} | {s['hero_holder']:.0f} | {s['allout']:.0f} | {s['drop']:.0f} | {s['dec']:.1f} | {s['rounds']:.1f} |")
with contextlib.redirect_stdout(buf):
    print('\n## Sensitivity, 6 players (readings, tactics, candidate fixes)')
    for tname, t in sim.TABLES.items():
        print(f"\n#### {tname}\n")
        print("| variant | Коридор / Половина / Закрыт % | passed mean (p10–p90) | Кречет out % @ round | signal % @ round | any hero down % | Тар down % | hero holds last turn % | all heroes out % |")
        print("|---|---|---|---|---|---|---|---|---|")
        for vname, ov in variants.V:
            oo = dict(t); oo.update(players=6); oo.update(ov)
            print(variants.line(vname, oo))
    print('\n## Alarm sweep, 6 players, Инне не показали, рифовый народ нейтрален, азбука без книги\n')
    sweep_main = sweep.__dict__
    import runpy
    runpy.run_path('sweep.py', run_name='__main__')
open('results-tables.md', 'w').write(buf.getvalue())
print('written results-tables.md')
