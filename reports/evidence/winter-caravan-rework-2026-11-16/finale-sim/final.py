#!/usr/bin/env python3
"""Round-2 text as written (wc-round2-decisions.md): rerun 400 runs/cell + reading flips."""
import sys, json
import tuned, sim
TEXT = dict(run_only=True, people_only=True, gorlo_from7=True, otrog_max=1, noise_from=sim.G4, pack_dist=(3,),
            fire_die=True, fire_pass='same', hold_gorlo=True, size_bonus=False)
RULINGS = dict(otrog_arrival='delays', otrog_bitable=False, down_rides=True, slide_fire='next', hero_hit_counts=True)
def go(rules, rulings, n):
    tuned.RULINGS.clear(); tuned.RULINGS.update(rulings)
    r = dict(tuned.BASE); r.update(rules)
    out = tuned.evaluate(r, n)
    return {f"{k[0]}|{'learned' if k[1] else 'unlearned'}|{k[2]}": v for k, v in out.items()}
if __name__ == '__main__':
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 400
    res = {'main': go(TEXT, RULINGS, n)}
    m = max(100, n // 2)
    res['fire_pass_next'] = go(dict(TEXT, fire_pass='next'), RULINGS, m)
    res['otrog_arrival_nothing'] = go(TEXT, dict(RULINGS, otrog_arrival='nothing'), m)
    saved = {k: dict(v) for k, v in sim.FIGHT.items()}
    for k in sim.FIGHT: sim.FIGHT[k]['pG1'] = 0.9
    res['pG1_0.9'] = go(TEXT, RULINGS, m)
    for k, v in saved.items(): sim.FIGHT[k] = v
    json.dump(res, sys.stdout, ensure_ascii=False, indent=1)
