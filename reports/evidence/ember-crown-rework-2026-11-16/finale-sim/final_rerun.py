"""Rerun of the gate battle as written after round-2 edits (commit 6787562f). Run: python3 final_rerun.py"""
import json, os, zlib
from multiprocessing import Pool
import gate_sim as g

TEXT = dict(g.BASE_RD, tear_row=10, tear_once=True, thr=20, thr_round=4, prone_no_block=True, onto_prone=True,
            lever_d=True, lever_f=True, lever_g=True, port_round=4, lever_j=True, lever_m=True, nb_need_signal=True)
READINGS = {
    'T  текст как написан (впустить сразу; после «В ворота!» доливки нет)': (TEXT, dict(let_in=True)),
    'T2 после «В ворота!» доливка продолжается': (dict(TEXT, refill_after_letin=True), dict(let_in=True)),
    'T3 стол не кричит «В ворота!»': (TEXT, dict(let_in=False)),
    'T4 рывок на Сайра (эксплойт)': (TEXT, dict(tactic='rush')),
    'T5 рывок; правка: срыв при 20 хитах — только с раунда 4': (dict(TEXT, tear_hp_round=4), dict(tactic='rush')),
    'T6 базовая политика с правкой T5': (dict(TEXT, tear_hp_round=4), dict(let_in=True)),
    'T7 рывок; правка: Сайр за створами до раунда 3': (dict(TEXT, sair_enter=3), dict(tactic='rush')),
    'T8 базовая политика с правкой T7': (dict(TEXT, sair_enter=3), dict(let_in=True)),
}
TABLES = ['понемногу', 'ворота', 'бросил низ']

def dawn(t, gate0):
    d = dict(g.TABLES[t])
    if t == 'ворота': d['market'] = 1        # «колонна ушла» — носильщики (r); Рынок stays 0 for costs
    if gate0: d['gates'] = 0
    return d

def job(a):
    lab, t, n, gate0 = a
    rd, pol_over = READINGS[lab]
    dw = dawn(t, gate0); pol = g.policy(dw); pol.update(pol_over)
    r = g.run_cell(n, dw, rd, pol, 400, zlib.crc32(f"{lab}|{t}|{n}|{gate0}".encode()))
    r.update(label=lab, table=t, gate0=gate0); return r

if __name__ == '__main__':
    import sys
    labs = [l for l in READINGS if not sys.argv[1:] or l.split()[0] in sys.argv[1:]]
    tasks = [(l, t, n, z) for l in labs for t in TABLES for z in (False, True) for n in (6, 7, 8)]
    old = []
    if sys.argv[1:] and os.path.exists('final_rerun.json'):
        old = [r for r in json.load(open('final_rerun.json')) if r['label'] not in labs]
    with Pool(4) as p: res = old + p.map(job, tasks, chunksize=1)
    here = os.path.dirname(os.path.abspath(__file__))
    json.dump(res, open(os.path.join(here, 'final_rerun.json'), 'w'), ensure_ascii=False, indent=1)
    print('done', len(res))
