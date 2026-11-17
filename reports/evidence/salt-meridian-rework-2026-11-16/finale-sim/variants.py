import sim
V = [
 ('baseline (wait, focus boss)', {}),
 ('rush', dict(policy='rush')),
 ('sig only (hold till signal, ignore Кречет)', dict(policy='sig')),
 ('focus adds first', dict(focus='adds')),
 ('with SRD Reckless (not printed)', dict(reckless=True)),
 ('no class features (no Cunning/Surge/2nd Wind)', dict(features=False)),
 ('no chain map (sentries act R1)', dict(map=False)),
 ('table never sends anyone to mast', dict(mast=False)),
 ('weak table: rush+adds+no features', dict(policy='rush', focus='adds', features=False)),
 ('weak table, no mast', dict(policy='rush', focus='adds', features=False, mast=False)),
 ('R: drop only when held in row 2', dict(R_drop='held')),
 ('R: Tar body blocks J2 (drag first)', dict(R_tarbody='drag')),
 ('R: late ships need new signal', dict(R_late='present_only')),
 ('R: Tar dashes to the winch', dict(R_tardash=True)),
 ('R: reef warriors 2 (evening 2 text)', dict(R_reefcount='two')),
 ('journal given to Inna', dict(inna='given')),
 ('FIX lag: drift one turn after signal/surrender', dict(fix='lag')),
 ('FIX mate: at 7+ surrender does not stop the flagship', dict(fix='mate')),
 ('FIX mate, rush', dict(fix='mate', policy='rush')),
]
def line(name, o):
    s = sim.summarize(sim.cell(o, runs=400))
    return (f"| {name} | {s['corr']:.0f} / {s['half']:.0f} / {s['closed']:.0f} | {s['mean']:.2f} ({s['p10']}–{s['p90']}) | "
            f"{s['boss']:.0f}% @ {s['boss_rd']:.1f} | {s['sig']:.0f}% @ {s['sig_rd']:.1f} | {s['anydown']:.0f} | {s['tar_down']:.0f} | {s['hero_holder']:.0f} | {s['allout']:.0f} |")
if __name__ == '__main__':
    import sys
    for tname, t in sim.TABLES.items():
        print(f"\n#### {tname}, 6 players\n")
        print("| variant | Коридор / Половина / Закрыт % | passed mean (p10–p90) | Кречет out % @ round | signal % @ round | any hero down % | Тар down % | hero holds last turn % | all heroes out % |")
        print("|---|---|---|---|---|---|---|---|---|")
        for name, o in V:
            oo = dict(t); oo.update(players=6); oo.update(o)
            print(line(name, oo))
