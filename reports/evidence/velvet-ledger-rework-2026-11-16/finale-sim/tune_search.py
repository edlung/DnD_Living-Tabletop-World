#!/usr/bin/env python3
"""Lever search for the last bell (coordinator's targets, 2026-11-16). Writes nothing; prints."""
import sys, itertools
from bell_sim import simulate, pct
BASE = dict(hand_voids_book_now=False, sold_returns=True)   # resolved readings + mandated sold-judge return
T = ('осторожный', 'средний', 'рискованный')
mode = sys.argv[1] if len(sys.argv) > 1 else 'thr'

def flip(name, a, n=120, size=6, **kw): return pct(simulate(name, size, n, amb=dict(BASE, **a), **kw), 'Перевёртыш')

def threshold(name, a, n=120):
    """Smallest Долг shift at which Перевёртыш < 50% (break-even gap = printed gap + shift)."""
    lo, hi = -40, 40
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if flip(name, dict(a, d_shift=mid), n) >= 50: lo = mid
        else: hi = mid
    return hi

if __name__ == '__main__':
    pass
    if mode == 'thr':
        for lab, a in [('text', {}), ('deal +2 lim5', dict(deal_gain=2, deal_limit=5)), ('no line kd', dict(line_kd=0)),
                       ('floor3 cap2', dict(kd_floor=3, short_cap=2))]:
            print(lab, {t: threshold(t, a) for t in T})

def margins(a, n=100, size=6):
    out = {}
    for t in T:
        r = simulate(t, size, n, amb=dict(BASE, **a)); out[t] = (r['p50'], pct(r, 'Перевёртыш'))
    return out

if __name__ == '__main__' and mode == 'grid':
    keys = dict(line_kd=(1, 0), kd_floor=(1, 3), short_cap=(3, 2), rumor_kd=(2, 1), deal=((3, 7, 13), (2, 5, 13), (3, 7, 16)),
                skup_plus=(0, 2), izd_plus=(0, 4), nadb_plus=(0, 1))
    for combo in itertools.product(*keys.values()):
        a = dict(zip(keys, combo)); g, l, dc = a.pop('deal'); a.update(deal_gain=g, deal_limit=l, deal_dc=dc)
        m = margins(a)
        c, md, r = (m[t][0] for t in T)
        print(f"{c - md:+5.0f} {r - md:+5.0f} | margins {c:+.0f} {md:+.0f} {r:+.0f} | flips {m[T[0]][1]:.0f} {m[T[1]][1]:.0f} {m[T[2]][1]:.0f} | {a}", flush=True)
