import sim
def row(o):
    s = sim.summarize(sim.cell(o, runs=400)); return f"{s['corr']:.0f}/{s['half']:.0f}/{s['closed']:.0f} μ{s['mean']:.2f}"
if __name__ == '__main__':
    print('| alarm | wait+focus | rush+focus | wait, no mast | weak (rush, adds, no features) | FIX mate (wait) |')
    print('|---|---|---|---|---|---|')
    for a in range(0, 11):
        base = dict(players=6, alarm=a, inna='none', reef='neutral', book=False)
        cells = [row(dict(base)), row(dict(base, policy='rush')), row(dict(base, mast=False)),
                 row(dict(base, policy='rush', focus='adds', features=False)), row(dict(base, fix='mate'))]
        print(f'| {a} | ' + ' | '.join(cells) + ' |')
    print()
    print('alarm 10 readings (6 players, Инне не показали, вражда):')
    for r in ('spent', 'leaves', 'stays'):
        for pol in ('wait', 'rush'):
            o = dict(players=6, alarm=10, inna='none', reef='hostile', book=False, R_aground=r, policy=pol)
            print(f'  Сойка aground={r:6} {pol}: {row(o)}   no mast: {row(dict(o, mast=False))}')
