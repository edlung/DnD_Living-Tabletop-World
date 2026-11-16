#!/usr/bin/env python3
"""Monte-Carlo simulator of the evening-6 flight «Шесть меток» (encounter `six-strokes`),
campaign collection-2026/hollow-choir. Rules are taken only from the campaign text
(encounter six-strokes, handouts stair-card / stair-dm, evening 6, world truth/endings,
items). Every interpretation the text leaves open is a named reading in RD below.

Run:  python3 sim.py            -> writes results.json next to this file
"""
import json, os, random, statistics
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../../../..'))
SRD = json.load(open(os.path.join(ROOT, 'scripts/campaign-shared/srd-blocks.json')))
GHOUL, GHAST = SRD['ghoul']['block'], SRD['ghast']['block']

def d(n, s): return sum(random.randint(1, s) for _ in range(n))
def d20(adv=False):
    a = random.randint(1, 20)
    return max(a, random.randint(1, 20)) if adv else a

# Hero stats as given by the task (saves from the package sheets: prof +2).
CLS = {
    'fighter': dict(hp=31, ac=11, dex=1, wis=1, melee=(5, 1, 8, 3)),
    'rogue':   dict(hp=24, ac=13, dex=5, wis=1, melee=(5, 1, 8, 3), bow=(5, 1, 6, 3)),
    'cleric':  dict(hp=24, ac=11, dex=1, wis=5, melee=(3, 1, 6, 1)),
    'wizard':  dict(hp=20, ac=12, dex=2, wis=3, melee=(1, 1, 6, -1)),
}
HEROES = [('Ядвига', 'fighter'), ('Антон', 'rogue'), ('Божена', 'cleric'), ('Илья', 'wizard'),
          ('Беата', 'fighter'), ('Карина', 'rogue'), ('Иероним', 'cleric'), ('София', 'wizard')]
GUESTS = ['Егор', 'Ирина', 'Дорота', 'Тадеуш', 'Эвелина', 'Мартин', 'Бронислава']
BOOK = ['Егор', 'Ирина', 'Дорота', 'Тадеуш', 'Эвелина', 'Мартин']  # then heroes, Бронислава last

# 06:00 starting states (hunger from evening 5 scene 5 / evening 6 / stair-dm; rosters and candle
# stocks are NOT printed by the campaign -> assumptions, see results.md).
ARCH = {
    'cautious': dict(hunger=9,  taken=['Егор'], spares=12, urm=8, matches=6),
    'middle':   dict(hunger=17, taken=['Егор', 'Дорота'], spares=8, urm=4, matches=4),
    'noisy':    dict(hunger=20, taken=['Егор', 'Тадеуш', 'Дорота', 'Эвелина'], spares=4, urm=0, matches=2),
}

def band(h):  # six-strokes trigger / stair-dm
    if h <= 10: return 15, 1, 12
    if h <= 15: return 15, 2, 12
    if h <= 17: return 15, 3, 14
    return 14, 3, 14

DEFAULT_RD = dict(entry='A',      # no key: A = placed in 12-14 then full move; B = enter row 14 from 15 (costs 1)
                  start='chosen',  # chosen = table packs rows 12-13; map14 = everyone on row 14 as drawn
                  pen='unit',      # unit = a failed save of a led/carried person slows the unit; solo = only own limit
                  serv='move_act', # move_act = servant moves then acts; move_only = moving is its whole turn
                  bow=False,        # rogue shortbow from the sheet (task lists rapier only)
                  warden=True,     # policy: tinderbox holder waits at row 1 (seat «ворота») until the stair is empty
                  carry_lead=False,  # exploit reading: a carrier may also lead one guest
                  niches=True, pulls=True, gk_focus=True)

class P:
    def __init__(s, name, kind, cls=None):
        s.name, s.kind, s.cls = name, kind, cls
        c = CLS.get(cls, {})
        s.hp = s.maxhp = c.get('hp', 0); s.ac = c.get('ac', 10)
        s.dexsv, s.wissv = c.get('dex', 0), c.get('wis', 0)
        s.row = None; s.st = 'cab'; s.caught_r = None; s.fallen = False
        s.candle = None; s.released_r = None; s.called = None; s.out_seq = None
        s.grab = None; s.hw = 4 if cls == 'cleric' else 0; s.lighter = None
        s.order = 0; s.role = None; s.pulled = False
        s.reset()
    def reset(s): s.moved = s.act = s.bonus = False; s.pen = 0; s.mv_left = None; s.left = 0
    @property
    def hero(s): return s.kind == 'hero'
    def base(s): return 3 if s.hero else (1 if s.name == 'Ирина' else 2)
    def can_carry(s): return (s.hero or s.name in ('Егор', 'Мартин')) and not s.fallen
    def free(s): return s.st == 'stair' and not s.fallen and s.grab is None

class S:
    def __init__(s, row): s.hp = GHOUL['hitPoints']['max']; s.row = row; s.hold = None
    @property
    def alive(s): return s.hp > 0

class Game:
    def __init__(g, arch, n, key, rd):
        A = ARCH[arch]; g.rd = rd; g.key = key; g.n = n
        start, g.spd, g.dc = band(A['hunger'])
        g.L = start if key else 15
        g.heroes = [P(nm, 'hero', c) for nm, c in HEROES[:n]]
        g.guests = [P(nm, 'guest') for nm in GUESTS if nm not in A['taken']]
        g.pullable = [P(nm, 'guest') for nm in A['taken']]
        for p in g.pullable: p.st = 'gone'
        for p in g.heroes + g.guests + g.pullable:
            p.order = BOOK.index(p.name) if p.name in BOOK else (10 + [h.name for h in g.heroes].index(p.name) if p.hero else 30)
        g.people = g.heroes + g.guests + g.pullable
        g.irina = next((p for p in g.guests if p.name == 'Ирина'), None)
        g.spares, g.urm, g.matches = A['spares'], A['urm'], A['matches']
        g.heroes[0].lighter = 'tinder'
        if n >= 3: g.heroes[2].lighter = 'matches'
        g.stub_given = False
        g.niche = {10: 'free', 5: 'free'}
        g.gk_hp, g.gk_row = GHAST['hitPoints']['max'], 1
        g.serv = [S(2 if i % 2 == 0 else 3) for i in range(2 if n <= 6 else 3)]
        g.seq = 0; g.r = 0; g.calls = 0; g.last_call = None; g.end = False
        g.st = Counter(); g.dec = []
        if key: g.place()

    # ----- helpers -----
    def on(g): return [p for p in g.people if p.st == 'stair']
    def gk_up(g): return g.gk_hp >= 19
    def place(g):
        ppl = sorted(g.heroes + g.guests, key=lambda p: (p.base(), p.order))
        for i, p in enumerate(ppl):
            p.st = 'stair'
            if g.rd['start'] == 'map14': p.row = 14
            elif not g.key and g.rd['entry'] == 'B': p.row = 15
            else: p.row = 12 if i < 8 else 13
            if p.hero: p.candle = 'normal'

    def prot(g):
        """Return {person: holder} for everyone under fire, and the set under the stub."""
        cap = {'normal': 2, 'stub': 2, 'urm': 1}
        holders = [p for p in g.on() if p.candle]
        pr = {h: h for h in holders}; load = {h: 0 for h in holders}
        def attach(p, pref):
            for h in pref + sorted(holders, key=lambda h: (abs(h.row - p.row), h.candle == 'stub')):
                if h in load and abs(h.row - p.row) <= 1 and load[h] < cap[h.candle]:
                    pr[p] = h; load[h] += 1; return
        for p in g.on():
            if p in pr: continue
            pref = [q for q in (getattr(p, 'link', []) or []) if q in load]
            attach(p, pref)
        stub = {p for p, h in pr.items() if h.candle == 'stub'}
        return pr, stub

    def light_spare(g):
        if g.spares > 0: g.spares -= 1; return 'normal'
        if g.urm > 0: g.urm -= 1; return 'urm'
        return None

    def attack(g, atk, ac, sneak=False):
        b, n, s, m = atk; g.st['rolls'] += 1
        roll = d20()
        if roll == 20 or (roll != 1 and roll + b >= ac):
            dmg = max(1, d(n * (2 if roll == 20 else 1), s) + m)
            if sneak: dmg += d(4 if roll == 20 else 2, 6)
            return dmg
        return 0

    def sneak_ok(g, h, row):
        return any(q.hero and q is not h and q.free() and abs(q.row - row) <= 1 for q in g.on())

    def feasible(g, row, speed=3):
        return row <= speed * (6 - g.r)

    # ----- round -----
    def run(g):
        for r in range(1, 7):
            g.r = r; g.rnd = Counter()
            for p in g.people: p.reset()
            g.step_call()
            g.step_people()
            g.step_servants()
            g.step_gk()
            g.step_choir()
            g.dec.append(dict(g.rnd))
            if getattr(g, 'trace', False): g.dump()
            if g.end: break
        for p in g.people:
            if p.st in ('stair', 'caught', 'cab'): p.st = 'taken'
        return g.result()

    def step_call(g):
        g.rnd['dm'] += 1  # the mark + Gatekeeper line
        ppl = [p for p in g.on() if p.grab is None or True]
        if not ppl: return
        pr, stub = g.prot()
        if g.r == 6:
            targets = [p for p in ppl if g.L - 2 <= p.row <= g.L - 1]
        else:
            targets = [max(ppl, key=lambda p: (p.row, -p.order))]
        beata = next((h for h in g.heroes if h.name == 'Беата' and h.st == 'stair' and not h.fallen), None)
        anyone_out = any(p.st == 'out' for p in g.people)
        for p in sorted(targets, key=lambda p: p.order):
            g.calls += 1; p.called = (g.r, g.calls if g.r < 6 else -p.order)
            adv = p in pr or (beata and abs(beata.row - p.row) <= 1) or (anyone_out and p.row <= 3)
            g.rnd['dm'] += 1; g.st['rolls'] += 1
            if d20(adv) + p.wissv < g.dc: p.pen = 1; g.st['call_fail'] += 1
        if targets: g.last_call = sorted(targets, key=lambda p: p.order)[0]

    # roles: tentative carry/lead plan, leftover heroes become closers / gk fighters / runners
    def plan(g):
        free_h = [h for h in g.heroes if h.free()]
        walkers = [p for p in g.on() if not p.hero and p.grab is None]
        need = 0
        for w in walkers:
            if w.fallen or w is g.irina: need += 2 if g.rd.get('carry_lead') is False else 1
            else: need += 1
        need -= sum(1 for w in walkers if w.name in ('Егор', 'Мартин') and not w.fallen)
        spare_heroes = max(0, len(free_h) - max(0, need))
        for h in free_h: h.role = None
        pool = sorted(free_h, key=lambda h: ({'wizard': 0, 'cleric': 1, 'rogue': 2, 'fighter': 3}[h.cls], -h.row))
        extra = pool[:spare_heroes]
        work = bool([p for p in g.pullable if p.st == 'gone']) or any(p.st == 'caught' for p in g.people)
        k = 0
        for h in extra:
            if work and k < 2 and h.cls in ('wizard', 'cleric') or (work and k == 0):
                h.role = 'closer'; k += 1
            elif h.cls in ('fighter', 'rogue') and g.rd['gk_focus']:
                h.role = 'gk'
            else:
                h.role = 'runner'

    def relight(g):
        for h in sorted([h for h in g.heroes if h.free() and not h.candle], key=lambda h: h.order):
            near = any(q.candle and abs(q.row - h.row) <= 1 for q in g.on() if q is not h)
            if near and not h.bonus and (g.spares or g.urm):
                h.candle = g.light_spare(); h.bonus = True; g.rnd['bonus'] += 1
            elif h.lighter == 'tinder' or (h.lighter == 'matches' and g.matches > 0):
                if g.spares or g.urm:
                    if h.lighter == 'matches': g.matches -= 1
                    h.candle = g.light_spare(); h.act = True; g.rnd['act'] += 1

    def give_stub(g):
        if g.stub_given or not g.irina or g.irina.st != 'stair': return
        cands = [h for h in g.heroes if h.free() and h.role == 'closer'] or \
                sorted([h for h in g.heroes if h.free()], key=lambda h: (-h.row, -h.order))
        if not cands: return
        h = cands[0]
        if h.candle == 'normal': g.spares += 1
        h.candle = 'stub'; h.bonus = True; g.stub_given = True; g.rnd['bonus'] += 1
        if h.lighter is None:  # policy: the matches go to the rear guard
            for q in g.heroes:
                if q.lighter == 'matches': q.lighter = None
            h.lighter = 'matches'

    def release(g, c):
        cands = [h for h in g.heroes if h.free() and not h.act and h.candle and h.mv_left is None
                 and (h.role in ('closer', 'gk', 'runner') or abs(h.row - c.row) <= 1)]
        best = None
        for h in sorted(cands, key=lambda h: (h.candle == 'stub', abs(h.row - c.row), h.order)):
            tgt = h.row if abs(h.row - c.row) <= 1 else (c.row - 1 if h.row < c.row else c.row + 1)
            cost = abs(tgt - h.row)
            if cost > 3: continue
            final = tgt - (3 - cost)
            if not g.feasible(final) and g.r < 6: continue
            relight = (g.spares + g.urm) > 0 and any(q.candle and q is not h and abs(q.row - tgt) <= 1 for q in g.on())
            if h.candle == 'stub' and not relight: continue
            if not relight and not (final < g.L - g.spd and h.candle != 'stub' and g.spares + g.urm > 0):
                continue
            best = (h, tgt, cost); break
        if not best: return False
        h, tgt, cost = best
        h.row = tgt; h.mv_left = 3 - cost; h.act = True; h.candle = None
        g.rnd['act'] += 1
        if not h.bonus and (g.spares or g.urm) and any(q.candle and abs(q.row - h.row) <= 1 for q in g.on() if q is not h):
            h.candle = g.light_spare(); h.bonus = True; g.rnd['bonus'] += 1
        c.st = 'stair'; c.caught_r = None; c.released_r = g.r; c.row = max(1, c.row - 2)
        g.st['released'] += 1
        return True

    def closers(g):
        for c in sorted([p for p in g.people if p.st == 'caught' and p.caught_r is not None and p.caught_r >= g.r - 1],
                        key=lambda p: (p.caught_r, p.order)):
            g.release(c)
        if not g.rd['pulls'] or g.r == 6: return
        gone = [p for p in g.pullable if p.st == 'gone']
        if not gone: return
        t = g.L - 1
        if t < 2 or not g.feasible(t - 2, 3) or t - 4 > 3 * (5 - g.r): return
        if g.spares + g.urm < 2: return
        pr, _ = g.prot()
        for h in sorted([h for h in g.heroes if h.free() and not h.act and h.mv_left is None],
                        key=lambda h: (h.role != 'closer', h.role is None, abs(h.row - t))):
            cost = abs(h.row - t)
            if cost > 3 or not h.candle: continue
            if not g.feasible(t - (3 - cost)): continue
            h.row = t; h.mv_left = 3 - cost; h.act = True; g.rnd['act'] += 1
            x = gone[0]; x.st = 'caught'; x.caught_r = g.r; x.row = t; x.pulled = True
            g.st['pulled'] += 1
            g.release(x)
            return

    def units(g):
        avail = [p for p in g.on() if not p.moved and p.grab is None]
        used = set(); out = []
        part = [h for h in avail if h.hero and h.mv_left is not None]
        for h in part:
            used.add(h)
            w = next((w for w in avail if not w.hero and w not in used and not w.fallen and getattr(w, 'link', None) == [h]
                      and abs(w.row - h.row) <= 3), None)
            if w is not None and w is not g.irina:
                used.add(w); w.row = h.row; out.append(('lead', [h, w], h.mv_left))
            else:
                out.append(('solo', [h], h.mv_left))
        def carriers_for(c, k):
            cand = [q for q in avail if q is not c and q not in used and q.can_carry() and abs(q.row - c.row) <= 1
                    and q.role not in ('closer', 'gk')]
            hs = sorted([q for q in cand if q.hero and q.candle], key=lambda q: (abs(q.row - c.row), q.order))
            first = hs[:1]
            rest = sorted([q for q in cand if q not in first], key=lambda q: (q.hero, abs(q.row - c.row), q.order))
            return (first + rest)[:k]
        for c in sorted([p for p in avail if p.fallen] + ([g.irina] if g.irina in avail and not g.irina.fallen else []),
                        key=lambda p: -p.row):
            if c in used: continue
            cs = carriers_for(c, 2)
            if g.irina is c and len(cs) < 2:  # not enough carriers: lead Irina (2) instead
                cs = []
            if c.fallen and not cs: used.add(c); continue
            if not cs: continue
            used.update(cs); used.add(c); c.link = cs
            sp = 3 if len(cs) == 2 else 2
            out.append(('carry', [c] + cs, sp))
        walkers = sorted([p for p in avail if not p.hero and p not in used and not p.fallen], key=lambda p: (-p.row, p.order))
        for w in walkers:
            hs = [h for h in avail if h.hero and not h.fallen and h not in used and abs(h.row - w.row) <= 1 and h.role not in ('closer', 'gk')]
            if not hs:
                hs = [h for h in avail if h.hero and not h.fallen and h not in used and abs(h.row - w.row) <= 1]
            if g.rd['carry_lead'] and not hs:
                for u in out:
                    if u[0] == 'carry' and not any(getattr(m, 'xlead', False) for m in u[1]):
                        cs = [m for m in u[1][1:] if m.hero and abs(m.row - w.row) <= 1]
                        if cs:
                            cs[0].xlead = True; u[1].append(w); used.add(w); w.link = [cs[0]]; break
                if w in used: continue
            if hs:
                h = min(hs, key=lambda h: (abs(h.row - w.row), h.order))
                used.update([h, w]); w.link = [h]
                out.append(('lead', [h, w], 2 if w is g.irina else 3))
            else:
                used.add(w); w.link = []
                if not w.candle and g.spares > 2:
                    w.candle = g.light_spare()
                out.append(('solo', [w], w.base()))
        for h in avail:
            if h not in used and not h.fallen: used.add(h); out.append(('solo', [h], 3))
        return out

    def gate_pass(g, members):
        """Who of a unit standing at the gate may pass: everyone if the Gatekeeper is at 18 or less,
        otherwise each fire-bearer and up to two (Urm: one) people holding on to him."""
        if not g.gk_up(): return list(members)
        cap = {'normal': 2, 'stub': 2, 'urm': 1}
        holders = [m for m in members if m.candle]
        ok = list(holders); load = {h: 0 for h in holders}
        for m in members:
            if m in ok: continue
            for h in holders:
                if load[h] < cap[h.candle]: load[h] += 1; ok.append(m); break
        carried = [m for m in members if m.fallen or (m is g.irina and len(members) > 2 and members[0] is m)]
        for c in carried:  # a carried person cannot pass without a carrier
            if c in ok and not any(q in ok for q in members if q is not c and q.can_carry()): ok.remove(c)
        return ok

    def step_people(g):
        if not g.key and g.r == 1:
            g.rnd['act'] += 1  # someone breaks the glass; nobody is on the stair yet
            return
        if not g.key and g.r == 2: g.place()
        g.plan()
        g.give_stub()
        g.relight()
        g.closers()
        us = g.units()
        us.sort(key=lambda u: min(m.row for m in u[1]))
        for kind, mem, sp in us:
            pen = [m.pen for m in mem if (g.rd['pen'] == 'unit' or m is mem[0] or kind == 'carry' and m is not mem[0]
                                          or kind == 'lead' and m.hero)]
            if kind == 'carry': pen = [m.pen for m in mem[1:]] + ([mem[0].pen] if g.rd['pen'] == 'unit' else [])
            if kind == 'lead': pen = [mem[0].pen] + ([mem[1].pen] if g.rd['pen'] == 'unit' else [])
            sp = max(0, sp - (max(pen) if pen else 0))
            start = max(m.row for m in mem)
            lead = mem[0] if kind != 'carry' else mem[1]
            dest = start - sp
            if kind == 'solo' and lead.hero and lead.role == 'gk' and g.gk_up() and g.r < 6:
                dest = max(dest, max(1, g.gk_row - 1) if lead.cls == 'fighter' else 1)
            g.rnd['units'] += 1
            # niche on the way
            for land in (10, 5):
                if g.rd['niches'] and g.niche[land] == 'free' and dest <= land <= start and g.L > land + 0:
                    hs = [m for m in mem if m.hero and not m.act and not m.bonus and m.candle]
                    if hs and (g.spares + g.urm) >= 1 and (g.spd >= 2 or g.spares + g.urm >= 3):
                        if g.urm: g.urm -= 1
                        else: g.spares -= 1
                        hs[0].act = hs[0].bonus = True; g.niche[land] = 'armed'
                        g.rnd['act'] += 1; g.rnd['bonus'] += 1; g.st['niche_' + str(land)] += 1
            if dest <= 0:
                warden = next((m for m in mem if m.hero and m.lighter == 'tinder'), None)
                others = [p for p in g.on() if p not in mem] + [p for p in g.people if p.st == 'caught']
                if warden is not None and others and g.r < 6 and g.rd.get('warden', True) and (g.spares + g.urm) > 0:
                    # seat «ворота»: the tinderbox holder keeps fire at the gate for the stragglers
                    for m in mem:
                        if m is not warden and not m.candle and not m.fallen and (g.spares + g.urm) > 0 and m.hero is False:
                            m.candle = g.light_spare(); g.rnd['bonus'] += 1
                    mem_pass = [m for m in g.gate_pass([m for m in mem if m is not warden])]
                else:
                    mem_pass = g.gate_pass(mem)
                for m in mem_pass:
                    g.seq += 1; m.st = 'out'; m.out_seq = g.seq; m.row = 0; m.moved = True
            left = sp - (start - 1) if dest <= 0 else 0
            dest = max(1, dest)
            for m in mem:
                if m.st == 'stair': m.row = dest; m.moved = True; m.left = left; m.unit = mem
        g.hero_actions()
        if not g.gk_up():  # attack first, then step through: blocked people with movement left pass now
            done = set()
            for p in [p for p in g.on() if p.row == 1 and getattr(p, 'left', 0) >= 1]:
                u = tuple(q for q in getattr(p, 'unit', [p]) if q.st == 'stair' and q.row == 1)
                if u in done: continue
                done.add(u)
                for m in g.gate_pass(list(u)):
                    g.seq += 1; m.st = 'out'; m.out_seq = g.seq; m.row = 0

    def hero_actions(g):
        for h in sorted([h for h in g.heroes if h.free()], key=lambda h: h.row):
            if h.cls == 'cleric' and not h.bonus and h.hw > 0:
                down = [q for q in g.heroes if q.st == 'stair' and q.fallen and abs(q.row - h.row) <= 12]
                if down:
                    q = down[0]; h.hw -= 1; h.bonus = True; q.hp = d(1, 4) + 3; q.fallen = False
                    g.rnd['bonus'] += 1; g.st['rolls'] += 1
            if h.act: continue
            bow = CLS[h.cls].get('bow') if g.rd['bow'] else None
            def hit_servant(sv):
                atk = bow if (bow and abs(sv.row - h.row) > 1) else CLS[h.cls]['melee']
                dmg = g.attack(atk, GHOUL['armorClass'], sneak=bool(bow) and g.sneak_ok(h, sv.row))
                h.act = True; g.rnd['act'] += 1
                if dmg:
                    sv.hp -= dmg
                    if sv.hold: sv.hold.grab = None; sv.hold = None; g.st['grab_broken'] += 1
            holding = [sv for sv in g.serv if sv.alive and sv.hold and (abs(sv.row - h.row) <= 1 or bow)]
            if holding: hit_servant(holding[0]); continue
            if g.gk_up() and (abs(g.gk_row - h.row) <= 1 or bow):
                atk = bow if (bow and abs(g.gk_row - h.row) > 1) else CLS[h.cls]['melee']
                sneak = h.cls == 'rogue' and g.sneak_ok(h, g.gk_row)
                g.gk_hp -= g.attack(atk, GHAST['armorClass'], sneak=sneak)
                h.act = True; g.rnd['act'] += 1; continue
            adj = [sv for sv in g.serv if sv.alive and abs(sv.row - h.row) <= 1]
            if adj: hit_servant(adj[0])

    def step_servants(g):
        for sv in g.serv:
            if not sv.alive: continue
            g.rnd['dm'] += 1
            if sv.hold:
                if sv.hold.st == 'stair':
                    sv.row = min(g.L - 1, sv.row + 2); sv.hold.row = max(sv.hold.row, sv.row); continue
                sv.hold = None
            ppl = [p for p in g.on()]
            if not ppl and not any(p.st == 'cab' for p in g.people): continue
            acted = g.serv_act(sv)
            if acted: continue
            tgt_row = min(ppl, key=lambda p: abs(p.row - sv.row)).row if ppl else 15
            step = max(-3, min(3, tgt_row - sv.row))
            sv.row = max(1, min(g.L - 1, sv.row + step))
            if g.rd['serv'] == 'move_act': g.serv_act(sv)

    def serv_act(g, sv):
        pr, _ = g.prot()
        near = [p for p in g.on() if abs(p.row - sv.row) <= 1]
        grab = [p for p in near if p not in pr and p.grab is None and (not p.hero or p.fallen)
                and not any(s.hold is p for s in g.serv)]
        if grab:
            p = min(grab, key=lambda p: p.order); p.grab = sv; sv.hold = p
            sv.row = min(g.L - 1, sv.row + 2); p.row = max(p.row, sv.row); g.st['grabbed'] += 1; return True
        fire = [p for p in near if p.candle]
        if fire:
            def first(h): return min([q.order for q, hh in pr.items() if hh is h] + [h.order])
            h = min(fire, key=first); g.st['rolls'] += 1
            if d20() + h.dexsv < 12: h.candle = None; g.st['doused'] += 1
            return True
        heroes = [p for p in near if p.hero and p not in pr and not p.fallen]
        if heroes:
            h = heroes[0]
            for a in GHOUL['attacks'][:2]:
                h.hp -= g.attack((a['bonus'], a['damage']['count'], a['damage']['sides'], a['damage']['bonus']), h.ac)
            if h.hp <= 0: h.hp = 0; h.fallen = True; g.st['hero_down'] += 1
            return True
        return False

    def step_gk(g):
        if not g.gk_up() or g.gk_hp <= 0: return
        g.rnd['dm'] += 1
        ppl = [p for p in g.on() if p.row <= 3]
        if not ppl: return
        tgt = min(ppl, key=lambda p: (abs(p.row - g.gk_row), p.order))
        g.gk_row = max(1, min(3, tgt.row))
        pr, _ = g.prot()
        near = [p for p in g.on() if abs(p.row - g.gk_row) <= 1]
        unp = [p for p in near if p not in pr]
        def prio(p):
            carried = any(p in getattr(q, 'link', []) for q in []) or (p is g.irina or p.fallen)
            led = not p.hero and bool(getattr(p, 'link', None))
            return (0 if carried else 1 if led else 2 if p.hero else 3, p.order)
        if unp:
            p = min(unp, key=prio); a = GHAST['attacks'][1]
            dmg = g.attack((a['bonus'], a['damage']['count'], a['damage']['sides'], a['damage']['bonus']), p.ac)
            if dmg:
                if p.hero:
                    p.hp -= dmg
                    if p.hp <= 0: p.hp = 0; p.fallen = True; g.st['hero_down'] += 1
                else:
                    p.fallen = True; g.st['guest_fell'] += 1
            return
        fire = [p for p in near if p.candle]
        if fire:
            def first(h): return min([q.order for q, hh in pr.items() if hh is h] + [h.order])
            min(fire, key=first).candle = None; g.st['blown'] += 1

    def step_choir(g):
        old = g.L; new = old - g.spd
        for land, stop in ((10, 11), (5, 6)):
            if g.niche[land] == 'armed' and old > land and new <= land:
                new = stop; g.niche[land] = 'used'; g.st['niche_fired'] += 1
        g.L = new
        for p in g.people:
            if p.st == 'caught' and p.caught_r is not None and p.caught_r < g.r:
                p.st = 'taken'; g.rnd['dm'] += 1; g.st['taken_by_line'] += 1
        pr, stub = g.prot()
        behind = [p for p in g.on() if p.row >= g.L]
        killed = set()
        for p in behind:
            if p in stub: continue
            h = pr.get(p)
            if h is not None:
                if h not in killed:
                    killed.add(h)
                continue
            p.st = 'caught'; p.caught_r = g.r; p.candle = None; g.rnd['dm'] += 1; g.st['caught'] += 1
            if p.grab: p.grab.hold = None; p.grab = None
        for h in killed:
            h.candle = None; g.rnd['dm'] += 1; g.st['line_snuff'] += 1
        if g.L <= 1 or g.r == 6 or (not g.on() and not any(p.st in ('caught', 'cab') for p in g.people)):
            g.end = True

    def dump(g):
        pr, stub = g.prot()
        rows = {}
        for p in g.people:
            if p.st in ('stair', 'caught'):
                tag = p.name[:3] + ('*' if p.candle == 'normal' else '§' if p.candle == 'stub' else 'u' if p.candle == 'urm' else '')
                tag += '' if p in pr else '!'
                tag += 'C' if p.st == 'caught' else ''
                tag += 'F' if p.fallen else ''
                tag += 'G' if p.grab else ''
                rows.setdefault(p.row, []).append(tag)
        outs = [p.name[:3] for p in g.people if p.st == 'out']
        print(f'R{g.r} L={g.L} GK={g.gk_hp}@{g.gk_row} serv={[(s.row, s.hp, s.hold.name[:3] if s.hold else None) for s in g.serv]} spares={g.spares}+{g.urm} niche={g.niche}')
        for r in sorted(rows): print('   ', r, ' '.join(rows[r]))
        print('    out:', outs, ' taken:', [p.name[:3] for p in g.people if p.st == 'taken'])

    def result(g):
        outs = sorted([p for p in g.people if p.st == 'out'], key=lambda p: p.out_seq)
        O = len(outs); V = g.n + 7
        end = 'top' if O >= V - 2 else ('mid' if O >= V - 5 else 'bad')
        rel = [p for p in outs if p.released_r]
        if rel: nn = max(rel, key=lambda p: (p.released_r, -p.order)); why = 'released'
        else:
            cal = [p for p in outs if p.called]
            if cal: nn = max(cal, key=lambda p: p.called); why = 'called'
            elif outs: nn = outs[-1]; why = 'last'
            else: nn = None; why = 'none'
        return dict(O=O, end=end,
                    heroes_lost=sum(1 for h in g.heroes if h.st != 'out'),
                    guests_out=sum(1 for p in outs if not p.hero),
                    pulled_out=sum(1 for p in outs if p.pulled),
                    irina_out=bool(g.irina and g.irina.st == 'out'),
                    nn_kind=(why + ':' + ('hero' if nn and nn.hero else 'guest')) if nn else 'none',
                    gk_hp=g.gk_hp, rounds=len(g.dec), stats=dict(g.st), dec=g.dec)

def cell(arch, n, key, rd, N=400, seed=1):
    random.seed(hash((arch, n, key, seed, tuple(sorted(rd.items())))) & 0xffffffff)
    res = [Game(arch, n, key, rd).run() for _ in range(N)]
    Os = sorted(r['O'] for r in res)
    q = lambda f: Os[min(len(Os) - 1, int(f * len(Os)))]
    ends = Counter(r['end'] for r in res)
    st = Counter()
    for r in res: st.update(r['stats'])
    rounds = [x for r in res for x in r['dec']]
    return dict(arch=arch, n=n, key=key,
                top=100 * ends['top'] / N, mid=100 * ends['mid'] / N, bad=100 * ends['bad'] / N,
                mean=statistics.mean(Os), p10=q(.1), p50=q(.5), p90=q(.9),
                alive=len(ARCH[arch]['taken']) and (n + 7 - len(ARCH[arch]['taken'])),
                hero_lost=100 * sum(1 for r in res if r['heroes_lost']) / N,
                irina=100 * sum(r['irina_out'] for r in res) / N,
                pulled=statistics.mean(r['pulled_out'] for r in res),
                gk_down=100 * sum(1 for r in res if r['gk_hp'] <= 18) / N,
                nn=Counter(r['nn_kind'] for r in res).most_common(3),
                per_round=dict(units=statistics.mean(x.get('units', 0) for x in rounds),
                               act=statistics.mean(x.get('act', 0) for x in rounds),
                               bonus=statistics.mean(x.get('bonus', 0) for x in rounds),
                               dm=statistics.mean(x.get('dm', 0) for x in rounds)),
                maxO=max(Os), minO=min(Os), rounds=statistics.mean(r['rounds'] for r in res),
                stats={k: round(v / N, 2) for k, v in st.items()})

def main():
    out = {'main': [], 'sens': {}, 'exploit': {}}
    for arch in ARCH:
        for key in (True, False):
            for n in (5, 6, 7, 8):
                out['main'].append(cell(arch, n, key, DEFAULT_RD))
    alts = {'entry=B': dict(entry='B'), 'start=map14': dict(start='map14'), 'pen=solo': dict(pen='solo'),
            'serv=move_only': dict(serv='move_only'), 'rogue shortbow': dict(bow=True)}
    for name, ch in alts.items():
        rd = dict(DEFAULT_RD, **ch)
        out['sens'][name] = [cell(a, 6, k, rd) for a in ARCH for k in (True, False)]
    ex = {'no niches': dict(niches=False), 'no pull-outs': dict(pulls=False),
          'carrier also leads': dict(carry_lead=True), 'no Gatekeeper focus': dict(gk_focus=False)}
    for name, ch in ex.items():
        rd = dict(DEFAULT_RD, **ch)
        out['exploit'][name] = [cell(a, 6, k, rd) for a in ARCH for k in (True, False)]
    out['candles'] = []
    for arch in ('middle', 'noisy'):
        for sp in (0, 4, 8, 16):
            saved = dict(ARCH[arch]); ARCH[arch].update(spares=sp, urm=0)
            for key in (True, False):
                c = cell(arch, 6, key, DEFAULT_RD); c['spares'] = sp; out['candles'].append(c)
            ARCH[arch].clear(); ARCH[arch].update(saved)
    json.dump(out, open(os.path.join(HERE, 'results.json'), 'w'), ensure_ascii=False, indent=1)
    return out

if __name__ == '__main__':
    main()
