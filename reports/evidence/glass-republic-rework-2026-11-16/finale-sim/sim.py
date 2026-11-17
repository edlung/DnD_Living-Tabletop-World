#!/usr/bin/env python3
"""Coup-night simulator for glass-republic evening 8, built strictly from the campaign text.

Sources: source/sessions-4.json (evening 8 scenes, dmNote, consequences), handouts night-card,
night-dm, dm-ledger, faction-sheet, encounters.json banner-hall-list, world.json endings,
variants/N-players.json starting cells. Ambiguities are explicit READINGS (see results.md).
Run: python3 -I sim.py [runs]  -> writes results.md next to this file.
"""
import random, sys, os, json, itertools
from collections import Counter, defaultdict

RUNS = int(sys.argv[1]) if len(sys.argv) > 1 else 400
HOUSES = ["AR", "NI", "PA", "RE", "PR", "TD"]
ARMED = {"AR", "NI", "RE"}
CITYH = ["PA", "RE", "PR", "TD"]

# ---------------------------------------------------------------- tables (after evening 7)
TABLES = {
    # Ориентир, evening 7 dmNote: А 6 6 3 4 4 0 (ПА, РЕ, ПР у Кассии)
    "А «поздно понял»": dict(h=dict(AR=6, NI=6, PA=3, RE=4, PR=4, TD=0),
        glass=dict(PA="K", RE="K", PR="K", TD="H"), bogdan=False, warned=False, struck=2,
        yula_left=False, quay_names=True, margins=True, t1=False, t2=False, goal="White"),
    # Б 2 2 6 6 6 5; all glasses with squad (ev 6 note: Орен предупреждён)
    "Б «город»": dict(h=dict(AR=2, NI=2, PA=6, RE=6, PR=6, TD=5),
        glass=dict(PA="S", RE="S", PR="S", TD="S"), bogdan=True, warned=True, struck=0,
        yula_left=False, quay_names=False, margins=True, t1=True, t2=True, goal="Square"),
    # В 4 5 3 6 5 1 (все стёкла у отряда); story of «генерал»: margins to Oren in ev 6 -> warned
    "В «генерал»": dict(h=dict(AR=4, NI=5, PA=3, RE=6, PR=5, TD=1),
        glass=dict(PA="S", RE="S", PR="S", TD="S"), bogdan=True, warned=True, struck=2,
        yula_left=False, quay_names=False, margins=True, t1=True, t2=True, goal="General"),
    # derived «середина»: green given to Кассия in ev 2, Юла's and Гелена's glasses kept,
    # no trade with Орен, Юла asked to leave, Богдан not reached
    "С «середина»": dict(h=dict(AR=5, NI=5, PA=4, RE=5, PR=4, TD=3),
        glass=dict(PA="S", RE="K", PR="S", TD="H"), bogdan=False, warned=False, struck=0,
        yula_left=True, quay_names=False, margins=True, t1=True, t2=False, goal="Square"),
}

ENDING = {"General": "Знамёна генералу", "White": "Белый мандат", "Square": "Площадь читает списки"}
SIDE_END = {"D": "General", "T": "White", "C": "Square", None: "Square"}

# ---------------------------------------------------------------- heroes / fight
HERO_ORDER = ["h-mara", "h-ilan", "h-sava", "h-tera", "h-nadir", "h-lis", "h-vey", "h-ora"]
CLS = {"h-mara": "fighter", "h-ilan": "rogue", "h-sava": "cleric", "h-tera": "wizard",
       "h-nadir": "fighter", "h-lis": "rogue", "h-vey": "cleric", "h-ora": "wizard"}
STATS = {"fighter": dict(hp=31, ac=11, atk=5, dmg=(1, 8, 3), init=1),
         "rogue": dict(hp=24, ac=13, atk=5, dmg=(1, 8, 3), init=3),
         "cleric": dict(hp=24, ac=11, atk=3, dmg=(1, 6, 1), init=0),
         "wizard": dict(hp=20, ac=12, atk=5, dmg=(1, 10, 0), init=2)}
START = {  # variants/N-players.json combatants (x from west, y from north, 0-based)
    6: dict(heroes={"h-mara": (0, 5), "h-ilan": (0, 6), "h-sava": (0, 4), "h-tera": (0, 7), "h-nadir": (0, 3), "h-lis": (0, 8)},
            foes=[(17, 5), (17, 6), (17, 4), (17, 7)], boss=(17, 3), spies=2, guards=2),
    7: dict(heroes={"h-mara": (0, 5), "h-ilan": (0, 6), "h-sava": (0, 4), "h-tera": (0, 7), "h-nadir": (0, 3), "h-lis": (0, 8), "h-vey": (0, 2)},
            foes=[(17, 5), (17, 6), (17, 4), (17, 7), (17, 3)], boss=(17, 8), spies=3, guards=2),
    8: dict(heroes={"h-mara": (0, 5), "h-ilan": (0, 6), "h-sava": (0, 4), "h-tera": (0, 7), "h-nadir": (0, 3), "h-lis": (0, 8), "h-vey": (0, 2), "h-ora": (0, 9)},
            foes=[(17, 5), (17, 6), (17, 4), (17, 7), (17, 3), (17, 8)], boss=(17, 2), spies=3, guards=3),
}
BENCH = [(9, 1), (9, 10), (6, 1), (6, 10)]  # J2, J11, G2, G11
CELLAR = (17, 11)  # R12
KEYCELL = (17, 6)  # R7


def d(n, s): return sum(random.randint(1, s) for _ in range(n))
def dist(a, b): return max(abs(a[0] - b[0]), abs(a[1] - b[1]))


def step_toward(p, q, n, minx=0):
    x, y = p
    for _ in range(n):
        if dist((x, y), q) <= 1: break
        nx = x + (q[0] > x) - (q[0] < x); ny = y + (q[1] > y) - (q[1] < y)
        if nx < minx: nx = x
        x, y = nx, ny
    return (x, y)


def adj_spot(p, q):
    """square adjacent to q, approached from p"""
    return step_toward(p, q, 99)


class U:
    def __init__(s, kind, pos, **kw):
        s.kind, s.pos = kind, pos
        s.__dict__.update(kw)


def fight(n_heroes_keys, n_players, spies, guards, deputies, yula_on_bench, gorget, tactic,
          spy_variant="engine"):
    """Tactical sim of «Вывод по списку». Returns dict."""
    st = START[n_players]
    heroes = []
    for k in n_heroes_keys:
        c = CLS[k]; S = STATS[c]
        heroes.append(U("hero", st["heroes"][k], key=k, cls=c, hp=S["hp"], max=S["hp"], ac=S["ac"],
                        atk=S["atk"], dmg=S["dmg"], init=S["init"], hw=4 if c == "cleric" else 0,
                        misty=2 if c == "wizard" else 0, role=None))
    foes = []
    slots = list(st["foes"])
    if guards > 0 and gorget: guards -= 1
    for i in range(spies):
        hp, natk = (10, 2) if spy_variant == "engine" else (27, 1)
        foes.append(U("spy", slots.pop(0), hp=hp, ac=12, atk=4, dmg=(1, 6, 2), natk=natk, init=4))
    for i in range(guards):
        foes.append(U("guard", slots.pop(0) if slots else (17, 9), hp=11, ac=16, atk=3, dmg=(1, 6, 1), natk=1, init=1))
    boss = U("boss", st["boss"], hp=67, ac=13, atk=5, dmg=(1, 12, 3), natk=1, init=1)
    foes.append(boss)
    deps = [U("dep", BENCH[i], state="bench", yula=(i == 0 and yula_on_bench)) for i in range(deputies)]
    for u in heroes + foes: u.ini = random.randint(1, 20) + u.init
    order = sorted(heroes + foes, key=lambda u: -u.ini)
    surrendered = False
    rounds = 0

    def live_h(): return [h for h in heroes if h.hp > 0]
    def live_f(): return [f for f in foes if f.hp > 0 and not (f is boss and surrendered)]
    def open_deps(): return [x for x in deps if x.state in ("bench", "led")]

    def attack(a, t, sneak=False):
        hits = 0
        for _ in range(getattr(a, "natk", 1)):
            if t.hp <= 0: break
            r = random.randint(1, 20)
            if r == 20 or (r != 1 and r + a.atk >= t.ac):
                n, s, b = a.dmg
                dmg = d(n * (2 if r == 20 else 1), s) + b
                if sneak and not hits:
                    dmg += d(4 if r == 20 else 2, 6)
                t.hp = max(0, t.hp - dmg); hits += 1
        return hits

    for rnd in range(1, 7):
        rounds = rnd
        # hero roles re-assigned each round
        free = live_h()
        for h in free: h.role = None
        need = sorted(open_deps(), key=lambda x: (x.state != "led", x.pos[0]))
        if tactic in ("escort", "balanced", "stall"):
            for dp in need:
                cand = [h for h in free if h.role is None and h.cls != "wizard"] or [h for h in free if h.role is None]
                if not cand: break
                h = min(cand, key=lambda h: dist(h.pos, dp.pos)); h.role = ("dep", dp)
        if tactic == "keyrush":
            # one escort only for a deputy being led away; everyone else to Zenon
            for dp in [x for x in need if x.state == "led"][:1]:
                cand = [h for h in free if h.role is None]
                if cand:
                    h = min(cand, key=lambda h: dist(h.pos, dp.pos)); h.role = ("dep", dp)
        for h in free:
            if h.role is None:
                h.role = ("boss",) if tactic in ("balanced", "keyrush", "stall") or not open_deps() else ("fight",)
        for u in order:
            if surrendered: break
            if u.hp <= 0: continue
            if u.kind == "hero":
                h = u
                # cleric bonus: Healing Word on a downed ally within 12
                if h.hw:
                    down = [x for x in heroes if x.hp == 0 and dist(x.pos, h.pos) <= 12]
                    if down:
                        x = down[0]; x.hp = min(x.max, d(2, 4) + 3); h.hw -= 1
                escorting = [x for x in deps if x.state in ("bench", "led") and dist(x.pos, h.pos) <= 1]
                role = h.role
                if tactic == "stall" and role and role[0] == "dep" and role[1] in escorting and not surrendered:
                    # exploit: guard the deputy on the bench (keeps the fight open until Зенон yields)
                    foe = [f for f in live_f() if dist(f.pos, h.pos) <= 1]
                    if foe: attack(h, foe[0], sneak=(h.cls == "rogue" and any(dist(o.pos, foe[0].pos) <= 1 for o in live_h() if o is not h)))
                    if boss.hp <= 30: surrendered = True
                    continue
                if role and role[0] == "dep" and role[1] in escorting or (escorting and role and role[0] != "boss"):
                    dp = role[1] if role[0] == "dep" and role[1] in escorting else escorting[0]
                    mv = 18 if h.cls == "rogue" else 12
                    nx = max(0, h.pos[0] - mv)
                    h.pos = (nx, h.pos[1]); dp.pos = (nx, h.pos[1] + (1 if h.pos[1] < 11 else -1))
                    if nx == 0: dp.state = "out"
                    else: dp.state = "bench"
                    continue
                if role and role[0] == "dep":
                    tgt = role[1].pos
                    if dist(h.pos, tgt) <= 7:
                        h.pos = adj_spot(h.pos, tgt) if dist(h.pos, tgt) > 1 else h.pos
                        foe = [f for f in live_f() if dist(f.pos, h.pos) <= 1]
                        if foe: attack(h, foe[0], sneak=(h.cls == "rogue" and any(dist(o.pos, foe[0].pos) <= 1 for o in live_h() if o is not h)))
                    else:
                        reach = 18 if h.cls == "rogue" else (18 if h.cls == "wizard" and h.misty else 12)
                        if h.cls == "wizard" and h.misty and dist(h.pos, tgt) > 13: h.misty -= 1
                        h.pos = step_toward(h.pos, tgt, reach)
                    continue
                # boss / fight role
                targets = live_f()
                if not targets: continue
                if role and role[0] == "boss" and not surrendered:
                    t = boss
                else:
                    t = min(targets, key=lambda f: dist(f.pos, h.pos))
                if h.cls == "wizard":
                    if dist(h.pos, t.pos) > 24: h.pos = step_toward(h.pos, t.pos, 6)
                    if dist(h.pos, t.pos) <= 24: attack(h, t)
                else:
                    if dist(h.pos, t.pos) > 1:
                        if dist(h.pos, t.pos) <= 7: h.pos = adj_spot(h.pos, t.pos)
                        elif h.cls == "rogue" and dist(h.pos, t.pos) <= 13: h.pos = adj_spot(h.pos, t.pos)
                        else: h.pos = step_toward(h.pos, t.pos, 18 if h.cls == "rogue" else 12); continue
                    if dist(h.pos, t.pos) <= 1:
                        attack(h, t, sneak=(h.cls == "rogue" and any(dist(o.pos, t.pos) <= 1 for o in live_h() if o is not h)))
                if boss.hp <= 30 and not surrendered:
                    surrendered = True
            else:
                f = u
                hs = live_h()
                if not hs: break
                if f is boss:
                    near = [h for h in hs if h.pos[0] >= 12 and dist(h.pos, f.pos) <= 7]
                    if near:
                        t = min(near, key=lambda h: dist(h.pos, f.pos))
                        f.pos = adj_spot(f.pos, t.pos); f.pos = (max(13, f.pos[0]), f.pos[1])
                        if dist(f.pos, t.pos) <= 1: attack(f, t)
                    else:
                        f.pos = step_toward(f.pos, KEYCELL, 6, minx=13)
                    continue
                # lead an unescorted deputy?
                lone = [x for x in deps if x.state in ("bench", "led") and not any(dist(h.pos, x.pos) <= 1 for h in hs)]
                mv = 12 if f.kind == "spy" else 6
                if f.kind == "guard":
                    lone = [x for x in lone if dist(x.pos, f.pos) <= 7]
                if lone:
                    x = min(lone, key=lambda x: dist(x.pos, f.pos))
                    app = max(0, dist(x.pos, f.pos) - 1)
                    lead = min(6, mv - app)  # one movement budget per turn; lead ≤ 6, «без рывка»
                    if lead > 0:
                        f.pos = adj_spot(f.pos, x.pos)
                        x.pos = step_toward(x.pos, CELLAR, lead); x.state = "led"
                        if dist(x.pos, CELLAR) == 0 or x.pos == CELLAR or (x.pos[0] >= 16 and x.pos[1] >= 10):
                            x.state = "taken"
                        f.pos = adj_spot(f.pos, x.pos)
                        continue
                # attack: spies prefer heroes escorting / nearest, guards hold middle
                if f.kind == "spy":
                    t = min(hs, key=lambda h: (0 if any(dist(h.pos, x.pos) <= 1 for x in open_deps()) else 1, dist(h.pos, f.pos)))
                else:
                    t = min(hs, key=lambda h: dist(h.pos, f.pos))
                    if dist(t.pos, f.pos) > 7:
                        f.pos = step_toward(f.pos, (9, 6), 6); continue
                if dist(f.pos, t.pos) - 1 <= mv:
                    f.pos = adj_spot(f.pos, t.pos)
                    sneak = f.kind == "spy" and any(dist(o.pos, t.pos) <= 1 for o in live_f() if o is not f)
                    attack(f, t, sneak=sneak)
                else:
                    f.pos = step_toward(f.pos, t.pos, mv)
        # end of fight by text: Зенон yielded, all heroes down, or every deputy out/taken
        if surrendered or not live_h() or not open_deps():
            break
    out = sum(1 for x in deps if x.state == "out")
    taken = sum(1 for x in deps if x.state == "taken")
    allfell = not live_h()
    if surrendered:
        for x in deps:
            if x.state in ("bench", "led"): x.state = "out"; out += 1
    elif allfell:
        for x in deps:
            if x.state in ("bench", "led"): x.state = "taken"; taken += 1
    yula = next((x.state for x in deps if x.yula), None)
    return dict(out=out, taken=taken, key=surrendered and not allfell, surrendered=surrendered, allfell=allfell,
                rounds=rounds, up=[h.key for h in heroes if h.hp > 0], yula=yula,
                downs=sum(1 for h in heroes if h.hp == 0), boss_hp=boss.hp)


# ---------------------------------------------------------------- night
def clamp(v): return max(0, min(6, v))


class Night:
    def __init__(s, t, n, policy, reading, rng_tag=""):
        s.h = dict(t["h"]); s.g = dict(t["glass"]); s.t = t; s.n = n; s.pol = policy; s.R = reading
        s.hold = {"НД": None, "ПД": None, "ГВ": None}
        s.officers = False; s.warned = t["warned"]; s.t1 = t["t1"]; s.t2 = t["t2"]
        s.deps = max(1, 4 - t["struck"] - (1 if t["yula_left"] else 0))
        s.mandate = False; s.key = False; s.log = []; s.steps = Counter(); s.pdhist = []
        s.yula = "PL" if t["yula_left"] else "hall"; s.oren_at = "ЗД"; s.fightres = None
        s.signal = None; s.strike = None; s.bogdan = t["bogdan"]
        heroes = HERO_ORDER[:n]
        s.heroes = heroes

    # --- helpers
    def ch(s, k, v, why, hour):
        old = s.h[k]; s.h[k] = clamp(s.h[k] + v)
        if s.h[k] != old: s.steps[hour] += 1; s.log.append(f"{hour} {k}{v:+d} {why}")

    def pairs(s, avail):
        """pairs from available heroes: (members, strength_on_GV)"""
        ps = []
        a = [h for h in avail]
        # fixed pairing from cast/spotlight: Тера+Илан, Надир+Ефрем, Таисия+Зарина, Матиас+Ора
        pref = [("h-tera", "h-ilan"), ("h-nadir", "h-sava"), ("h-mara", "h-lis"), ("h-vey", "h-ora")]
        used = set()
        for p in pref:
            m = [x for x in p if x in a and x not in used]
            if len(m) == 2: ps.append(tuple(m)); used |= set(m)
        rest = [x for x in a if x not in used]
        while len(rest) >= 2: ps.append((rest.pop(0), rest.pop(0)))
        if rest: ps.append((rest.pop(0),))
        return ps

    def pstr(s, p, place):
        if len(p) == 1: return 1
        if place == "ГВ" and ("h-tera" in p or "h-ora" in p): return 3
        return 2

    def house_auto(s, k, hour):
        """place of a house without the squad's glass; returns (place, side) or None"""
        v = s.h[k]; g = s.g.get(k, "H")
        if k == "AR" or k == "NI": return None
        if g == "K":
            return None  # RE barracks, PR home, PA ≤4 in the Hall (until 04:00)
        if k == "TD": return None
        if v <= 2: return None
        if v <= 4:
            return None if k == "PA" else ("ПЛ", "C")
        return {"PA": ("ПД", "C"), "RE": ("ПД", "C"), "PR": ("НД", "C")}[k]

    def contest(s, place, pres, hour):
        """pres: list of (side, strength, house|None). Applies text rule."""
        sides = defaultdict(list)
        for e in pres: sides[e[0]].append(e)
        if not sides: return
        s.steps[hour] += 1
        if len(sides) == 1:
            s.hold[place] = next(iter(sides)); return
        def shoots(sd): return any(e[2] in ARMED and s.h[e[2]] >= 5 for e in sides[sd])
        shooters = [sd for sd in sides if shoots(sd)]
        tot = {sd: sum(e[1] for e in sides[sd]) for sd in sides}
        if len(shooters) == 1:
            win = shooters[0]
            for sd in sides:
                if sd == win: continue
                for e in sides[sd]:
                    if e[2] and e[2] not in ARMED: s.ch(e[2], -1, f"проиграл {place} под стрельбой", hour)
        else:
            cand = shooters if shooters else list(sides)
            best = max(tot[sd] for sd in cand)
            top = [sd for sd in cand if tot[sd] == best]
            win = s.hold[place] if len(top) > 1 and s.hold[place] in top else (top[0] if len(top) == 1 else s.hold[place])
            if len(shooters) >= 2:
                for sd in shooters:
                    if sd != win:
                        for e in sides[sd]:
                            if e[2] in ARMED and s.h[e[2]] >= 5: s.ch(e[2], -1, f"стреляли обе стороны у {place}", hour)
        s.hold[place] = win

    # --- hour routine
    def run(s):
        P = s.pol; t = s.t
        avail = list(s.heroes)
        ps = s.pairs(avail)
        # 22:00 ------------------------------------------------------------
        H = "22"; s.steps[H] += 6  # read numbers, glasses, four facts (once) + hour text
        asg = P.place(s, H, ps)
        pres = defaultdict(list)
        if s.h["AR"] >= 5: pres["НД"].append(("D", s.h["AR"], "AR"))
        if s.h["NI"] >= 3: pres["ГВ"].append(("T", s.h["NI"], "NI"))
        s.add_houses(H, pres, asg)
        s.add_pairs(pres, asg, ps)
        # Богдан
        for p, a in zip(ps, asg["pairs"]):
            if a == ("ЗД", "bogdan") and not s.bogdan:
                s.steps[H] += 1
                ok = "h-nadir" in p or random.random() < 0.55
                if ok: s.bogdan = True; s.ch("AR", -1, "поздний отказ Богдана", H)
        for pl in ("НД", "ПД", "ГВ"): s.contest(pl, pres[pl], H)
        s.pdhist.append(s.hold["ПД"])
        # 23:00 ------------------------------------------------------------
        H = "23"; s.steps[H] += 2
        asg = P.place(s, H, ps); pres = defaultdict(list)
        if s.h["AR"] >= 3: pres["НД"].append(("D", s.h["AR"], "AR"))
        if s.h["NI"] >= 3: pres["ГВ"].append(("T", s.h["NI"], "NI"))
        s.add_houses(H, pres, asg); s.add_pairs(pres, asg, ps)
        for pl in ("НД", "ПД", "ГВ"): s.contest(pl, pres[pl], H)
        s.officers = s.hold["НД"] == "D"
        s.pdhist.append(s.hold["ПД"])
        # 00:00 ------------------------------------------------------------
        H = "00"; s.steps[H] += 3
        asg = P.place(s, H, ps); pres = defaultdict(list)
        pres["ПД"].append(("D", s.h["AR"] if s.officers else 2, "AR" if s.officers else None))
        if s.hold["НД"] == "D" or s.h["AR"] >= 5: pres["НД"].append(("D", s.h["AR"], "AR"))
        if s.h["NI"] >= 3: pres["ГВ"].append(("T", s.h["NI"], "NI"))
        s.add_houses(H, pres, asg); s.add_pairs(pres, asg, ps)
        for pl in ("НД", "ПД", "ГВ"): s.contest(pl, pres[pl], H)
        s.pdhist.append(s.hold["ПД"])
        # 01:00 ------------------------------------------------------------
        H = "01"; s.steps[H] += 4
        if s.warned: s.ch("NI", -2, "Орен предупреждён: офицеры Нити взяты", H)
        s.hold["ГВ"] = None
        asg = P.place(s, H, ps); pres = defaultdict(list)
        if s.h["AR"] >= 3: pres["ГВ"].append(("D", s.h["AR"], "AR"))
        s.add_dawn_doors(pres)
        s.add_houses(H, pres, asg); s.add_pairs(pres, asg, ps)
        for pl in ("НД", "ПД", "ГВ"): s.contest(pl, pres[pl], H)
        onpl = [k for k in CITYH if s.side_place(k, H, asg) == ("ПЛ", "C")]
        if s.hold["ГВ"] == "D":
            s.signal = "red"
            for k in onpl: s.ch(k, -1, "красный сигнал", H)
        elif s.hold["ГВ"] == "C":
            if P.white_signal(s) and not s.t1:
                s.signal = "white"; s.t1 = True; s.ch("AR", -2, "белый сигнал «Список»", H)
            else:
                s.signal = "green"
                for k in onpl: s.ch(k, +1, "зелёный сигнал", H)
        quay = any(a == ("Пристань", "lead") for a in asg["pairs"])
        if s.h["TD"] <= 2:
            if t["quay_names"] and not quay:
                s.ch("PR", -2, "аресты причалов", H); s.ch("TD", -1, "взяты курьеры", H)
        s.pdhist.append(s.hold["ПД"])
        # 02:00 ------------------------------------------------------------
        H = "02"; s.steps[H] += 3
        if s.hold["НД"] == "D" or s.hold["ПД"] == "D":
            s.oren_at = "НД" if s.hold["НД"] == "D" else "ПД"
        elif s.h["AR"] <= 2:
            s.oren_at = "ЗД"
        else:
            s.oren_at = "ПД*"
        asg = P.place(s, H, ps); pres = defaultdict(list)
        if s.oren_at == "ПД*": pres["ПД"].append(("D", s.h["AR"], "AR"))
        s.add_dawn_doors(pres)
        s.add_houses(H, pres, asg); s.add_pairs(pres, asg, ps)
        for p, a in zip(ps, asg["pairs"]):
            mat = "h-vey" in p
            if a == ("Орен", "promise"):
                s.steps[H] += 1; s.deps = max(1, s.deps - 1); s.ch("AR", 1 + mat, "обещание Орену", H)
            elif a == ("Орен", "margins"):
                s.steps[H] += 1; s.warned = True; s.ch("AR", 1, "поля показаны Орену", H)
                if not s.t2: s.t2 = True; s.ch("NI", -2, "разоблачение полей", H)
            elif a == ("Кассия", "promise"):
                s.steps[H] += 1; s.mandate = True
                if mat: s.ch("NI", 1, "обещание Кассии при Матиасе", H)
        for pl in ("НД", "ПД", "ГВ"): s.contest(pl, pres[pl], H)
        if s.oren_at == "ПД*": s.oren_at = "ПД" if s.hold["ПД"] == "D" else "ЗД"
        s.pdhist.append(s.hold["ПД"])
        # 03:00 ------------------------------------------------------------
        H = "03"; s.steps[H] += 4
        city_pd_start = s.hold["ПД"] in ("C",) or (s.hold["ПД"] is None)
        stay = P.stay_at_pd(s, ps) if s.R["close"] == "pair-stays" else None
        infight = [h for h in s.heroes if not (stay and h in stay)]
        if s.R["close"] == "contest":
            pres = defaultdict(list)
            pres["ПД"].append(("D", s.h["AR"] if s.officers else 2, "AR" if s.officers else None))
            for k in CITYH:
                sp = s.side_place(k, H, P.place(s, H, ps))
                if sp and sp[0] == "ПД": pres["ПД"].append((sp[1], s.h[k], k))
            s.contest("ПД", pres["ПД"], H)
        elif not stay:
            s.hold["ПД"] = "D"; s.steps[H] += 1
        else:
            s.hold["ПД"] = s.hold["ПД"] if s.hold["ПД"] else "C"
        ar = s.h["AR"]
        spies = START[s.n]["spies"] - (1 if 3 <= ar <= 4 else 0)
        if ar <= 2: spies = 0
        guards = START[s.n]["guards"]
        pa_eff = min(s.h["PA"], 4) if s.g["PA"] == "K" else s.h["PA"]
        if pa_eff >= 5 or city_pd_start: guards = 0
        deps = s.deps
        pre_out = 0
        if s.h["TD"] >= 5 and deps >= 2: pre_out = 1
        bench = max(1, deps - pre_out)
        if deps - pre_out < 1: pre_out = deps - 1
        yula_bench = s.yula == "hall"
        fr = fight(infight, s.n, spies, guards, bench, yula_bench, "h-mara" in infight, P.tactic(s),
                   s.R.get("spy", "engine"))
        s.fightres = fr; s.fight_size = (spies, guards, bench, len(infight))
        s.steps[H] += 3
        s.ch("PA", fr["out"] + pre_out - fr["taken"], "итог Зала знамён", H)
        if fr["key"]: s.key = True
        if yula_bench: s.yula = {"out": "free", "taken": "taken", "bench": "free"}.get(fr["yula"], "free")
        s.pdhist.append(s.hold["ПД"])
        # 04:00 ------------------------------------------------------------
        H = "04"; s.steps[H] += 4
        up = [h for h in s.heroes if (h in fr["up"]) or (stay and h in stay)]
        ps4 = s.pairs(up)
        asg = P.place(s, H, ps4)
        th = sum(s.pstr(p, "") for p, a in zip(ps4, asg["pairs"]) if a == ("Удар", "T"))
        dw = sum(s.pstr(p, "") for p, a in zip(ps4, asg["pairs"]) if a == ("Удар", "D"))
        kglass = [k for k in CITYH if s.g[k] == "K"]
        attempt = not (s.h["NI"] <= 2 and s.g["RE"] != "K")
        if attempt:
            s.steps[H] += 1
            if s.warned:
                s.strike = "fail"; s.ch("NI", -2, "удар не удался (Орен предупреждён)", H)
            else:
                tv = s.h["NI"] + sum(s.h[k] for k in kglass) + th
                dv = s.h["AR"] + dw
                if tv >= dv:
                    s.strike = "ok"; s.ch("AR", -2, "удар Нити: Орен и Карх под стражей", H)
                    if s.hold["НД"] == "D": s.hold["НД"] = "T"
                    if s.hold["ПД"] == "D": s.hold["ПД"] = "T"
                else:
                    s.strike = "fail"; s.ch("NI", -2, "удар Нити отбит", H)
        else:
            s.strike = "none"
        # City contests ПД as usual
        pres = defaultdict(list)
        hold = s.hold["ПД"]
        if hold == "T":
            pres["ПД"].append(("T", s.h["NI"], "NI"))
            if s.g["RE"] == "K": pres["ПД"].append(("T", s.h["RE"], "RE"))
        elif hold == "D":
            pres["ПД"].append(("D", s.h["AR"] if s.officers else 2, "AR" if s.officers else None))
        for k in CITYH:
            if s.g[k] == "K": continue
            sp = s.side_place(k, H, asg)
            if sp and sp[0] == "ПД": pres["ПД"].append((sp[1], s.h[k], k))
        for p, a in zip(ps4, asg["pairs"]):
            if a and a[0] == "ПД": pres["ПД"].append((a[1], s.pstr(p, "ПД"), None))
        s.contest("ПД", pres["ПД"], H)
        s.pdhist.append(s.hold["ПД"])
        # 05:00 ------------------------------------------------------------
        H = "05"; s.steps[H] += 4
        holder = s.hold["ПД"] if s.hold["ПД"] in ("D", "T", "C") else "C"
        if holder == "D" and s.strike == "ok":
            holder = "T"
        s.holder = holder
        silence_end = SIDE_END[holder]
        opts = s.options(holder)
        choice = P.balcony(s, opts, silence_end)
        s.choice = choice
        s.opts = opts
        if choice == "silence" or choice not in opts:
            end = silence_end
        else:
            end = choice
        s.end = end
        s.silence_end = silence_end
        return end

    def options(s, holder):
        key = s.key or s.R["key"] == "lenient"
        opts = []
        if not key: return opts  # strict: without the key — silence
        opts.append("General")
        if s.t["margins"] or s.mandate: opts.append("White")
        if s.key or holder == "C": opts.append("Square")
        return opts

    def side_place(s, k, hour, asg):
        if s.g.get(k) == "S":
            return asg["houses"].get(k)
        return s.house_auto(k, hour)

    def add_houses(s, H, pres, asg):
        for k in CITYH:
            sp = s.side_place(k, H, asg)
            if sp and sp[0] in ("НД", "ПД", "ГВ"):
                pres[sp[0]].append((sp[1], s.h[k], k))
            s.steps[H] += 1 if sp else 0

    def add_pairs(s, pres, asg, ps):
        for p, a in zip(ps, asg["pairs"]):
            if a and a[0] in ("НД", "ПД", "ГВ") and a[1] in ("C", "D", "T"):
                pres[a[0]].append((a[1], s.pstr(p, a[0]), None))

    def add_dawn_doors(s, pres):
        if s.hold["НД"] == "D": pres["НД"].append(("D", s.h["AR"], "AR"))
        if s.hold["ПД"] == "D": pres["ПД"].append(("D", s.h["AR"] if s.officers else 2, "AR" if s.officers else None))


# ---------------------------------------------------------------- policies
def legal(s, k, place):
    v = s.h[k]
    if v <= 2: return False
    if place == "ПЛ": return v <= 4 or True
    if v <= 4: return True  # «к одному месту»
    return True


class Policy:
    name = "base"; target = None
    def __init__(s, target, greedy_table=None, fight="balanced", stay=False):
        s.target = target; s.gt = greedy_table; s.ft = fight; s.st = stay
    def tactic(s, n): return s.ft
    def white_signal(s, n): return True
    def stay_at_pd(s, n, ps):
        if not s.st or len(ps) < 2: return None
        p = [p for p in ps if "h-mara" not in p][-1]
        return list(p)

    def houses(s, n, H, side):
        out = {}
        for k in CITYH:
            if n.g[k] != "S" or n.h[k] <= 2: continue
            if k == "TD" and side == "C": out[k] = ("ГВ", "C") if n.h[k] >= 3 and H in ("01",) else ("ПД", "C"); continue
            if k == "PR" and side == "C" and n.h["AR"] < 5 and H in ("22", "23"): out[k] = ("НД", "C"); continue
            if side == "C" and k == "PR" and H == "01" and n.h["AR"] >= 3: out[k] = ("ГВ", "C"); continue
            out[k] = ("ПД", side)
        return out

    def place(s, n, H, ps):
        T = s.target
        pa = []; ho = {}
        if T == "Square":
            ho = s.houses(n, H, "C")
            for i, p in enumerate(ps):
                if H == "22" and "h-nadir" in p and not n.bogdan: pa.append(("ЗД", "bogdan")); continue
                if H == "01" and ("h-tera" in p or "h-ora" in p): pa.append(("ГВ", "C")); continue
                if H == "01" and n.t["quay_names"] and n.h["TD"] <= 2 and "h-lis" in p: pa.append(("Пристань", "lead")); continue
                if H == "04": pa.append(("ПД", "C")); continue
                pa.append(("ПД", "C"))
        elif T == "General":
            ho = s.houses(n, H, "D")
            for i, p in enumerate(ps):
                if H == "02":
                    if not n.warned and i == 0: pa.append(("Орен", "margins")); continue
                    if i == 1 or (n.warned and i == 0): pa.append(("Орен", "promise")); continue
                if H == "04": pa.append(("Удар", "D") if not n.warned else ("ПД", "D")); continue
                pa.append(("ПД", "D") if H != "01" else ("ГВ", "D"))
        elif T == "White":
            ho = s.houses(n, H, "T") if s.gt != "A" else {}
            for i, p in enumerate(ps):
                if H == "22" and "h-nadir" in p and not n.bogdan: pa.append(("ЗД", "bogdan")); continue
                if H == "02" and i == 0: pa.append(("Кассия", "promise")); continue
                if H == "04": pa.append(("Удар", "T")); continue
                if H in ("22", "23", "00") and ("h-tera" in p): pa.append(("ГВ", "T")); continue
                pa.append(("ПД", "C") if s.gt == "A" else ("ПД", "T"))
        return {"pairs": pa, "houses": ho}

    def balcony(s, n, opts, silence_end):
        T = s.target
        if T in opts: return T
        return "silence"


class GreedyA(Policy):
    """Стол А trusts Кассия but wants open doors (skeleton 4.11 behaviour)."""
    def place(s, n, H, ps):
        pa = []
        for i, p in enumerate(ps):
            if H == "22" and "h-nadir" in p and not n.bogdan: pa.append(("ЗД", "bogdan")); continue
            if "h-tera" in p and H in ("22", "23", "00"): pa.append(("ГВ", "T")); continue
            if "h-tera" in p and H == "01": pa.append(("ПЛ", "T")); continue
            if "h-tera" in p and H == "02": pa.append(("Кассия", "promise")); continue
            if "h-tera" in p and H == "04": pa.append(("Удар", "T")); continue
            pa.append(("ПД", "C"))
        return {"pairs": pa, "houses": {}}


class GreedyV(Policy):
    """Стол В: with Орен: glass houses and pairs for the Dawn, one promise to Орен at 02:00,
    no margins shown at night (already warned), balanced fight."""
    def place(s, n, H, ps):
        ho = Policy.houses(s, n, H, "D")
        pa = []
        for i, p in enumerate(ps):
            if H == "02" and i == 0: pa.append(("Орен", "promise")); continue
            if H == "04": pa.append(("Удар", "D")); continue
            pa.append(("НД", "D"))
        return {"pairs": pa, "houses": ho}


class GreedyS(Policy):
    """Середина: City first, takes Кассия's mandate as insurance at 02:00."""
    def place(s, n, H, ps):
        d = Policy.place(s, n, H, ps)
        if H == "02" and ps: d["pairs"][-1] = ("Кассия", "promise")
        return d
    def balcony(s, n, opts, silence_end):
        if "Square" in opts: return "Square"
        if silence_end == "Square": return "silence"
        return "White" if "White" in opts else "silence"


def greedy_for(tname):
    if tname.startswith("А"): return GreedyA("White", "A", fight="balanced")
    if tname.startswith("Б"): return Policy("Square", fight="balanced", stay=True)
    if tname.startswith("В"): return GreedyV("General", fight="balanced")
    return GreedyS("Square", fight="balanced", stay=True)


READINGS = {
    # key: strict = «без ключа — молчание» (check of scene 4, decision 6);
    #      lenient = the PD holder «выводит вас» and the squad still reads (05:00 play)
    # close: literal = squad is all in the Hall at 03:00, so Dawn always closes ПД;
    #        pair-stays = a pair may skip the fight and stand at ПД (night-card invites it);
    #        contest = Dawn must win ПД against City houses standing there
    "R1 strict/literal": dict(key="strict", close="literal"),
    "R2 strict/pair-stays": dict(key="strict", close="pair-stays"),
    "R3 lenient/literal": dict(key="lenient", close="literal"),
    "R4 strict/contest": dict(key="strict", close="contest"),
}


def run_cell(tname, n, pol, R, runs):
    res = Counter(); ch = Counter(); forced = 0; fstat = Counter(); hours = Counter(); steps = Counter()
    holder = Counter(); strike = Counter(); chend = Counter(); rounds = 0; fsize = Counter()
    avail = Counter(); silend = Counter()
    for i in range(runs):
        night = Night(TABLES[tname], n, pol, R)
        end = night.run()
        res[end] += 1; ch[night.choice] += 1; chend[(night.choice, end)] += 1
        if len(night.opts) <= 1: forced += 1
        fr = night.fightres
        fstat["key"] += fr["key"]; fstat["allfell"] += fr["allfell"]; fstat["taken"] += fr["taken"] > 0
        fstat["onlyzenon"] += night.fight_size[0] == 0 and night.fight_size[1] == 0
        fstat["downs"] += fr["downs"]; rounds += fr["rounds"]
        fsize[night.fight_size] += 1
        holder[night.holder] += 1; strike[night.strike] += 1
        for o in night.opts: avail[o] += 1
        silend[night.silence_end] += 1
        # deciding hour
        if night.choice != "silence" and end != night.silence_end: dh = "05 (балкон)"
        else:
            hist = night.pdhist; final = hist[-1]; dh = "22"
            labels = ["22", "23", "00", "01", "02", "03", "04"]
            for j in range(len(hist)):
                if hist[j] != final: dh = labels[min(j + 1, 6)]
            if night.strike == "ok" and night.holder == "T": dh = "04"
        hours[dh] += 1
        for k, v in night.steps.items(): steps[k] += v
    return dict(res=res, ch=ch, forced=forced, fstat=fstat, hours=hours, steps=steps, holder=holder,
                strike=strike, chend=chend, rounds=rounds / runs, fsize=fsize, runs=runs, avail=avail, silend=silend)


def pct(a, b): return f"{100 * a / b:.0f}%"


def main():
    random.seed(20261116)
    out = []
    W = out.append
    W("# glass-republic: coup-night simulation of evening 8 (final critic)\n")
    W(f"Simulator: `sim.py` (this folder), {RUNS} runs per cell, seed 20261116. Built only from the campaign text "
      "(evening 8 scenes/dmNote/consequences, `night-card`, `night-dm`, `dm-ledger`, `faction-sheet`, encounter "
      "`banner-hall-list`, `world.endings`, `variants/N-players.json` cells). Fight roster as given by the caller "
      "(spy AC 12, 10 HP, 2×1d6+2, sneak 2d6; guard AC 16, 11 HP; Зенон AC 13, 67 HP, yields at 30).\n")
    W("## Start of the night (after evening 7)\n")
    W("| table | АР НИ ПА РЕ ПР ТД | glasses (S squad, K Кассия, H house) | Богдан отказал | Орен предупреждён | депутатов | имена причалов | goal of greedy policy |")
    W("|---|---|---|---|---|---|---|---|")
    for k, t in TABLES.items():
        h = t["h"]; g = t["glass"]
        W(f"| {k} | {' '.join(str(h[x]) for x in HOUSES)} | ПА {g['PA']} РЕ {g['RE']} ПР {g['PR']} ТД {g['TD']} | {'да' if t['bogdan'] else 'нет'} | {'да' if t['warned'] else 'нет'} | {max(1, 4 - t['struck'] - t['yula_left'])} | {'да' if t['quay_names'] else 'нет'} | {ENDING[t['goal']]} |")
    W("\nА/Б/В numbers and glasses are the evening-7 «Ориентир» line; the four facts are not printed per table, they are "
      "inferred from the evening 3–7 Ориентир notes and the skeleton stories (assumption, see ambiguity A1). "
      "«Середина» is derived.\n")
    big = {}
    for Rn, R in READINGS.items():
        for tname in TABLES:
            for n in (6, 7, 8):
                pols = {"greedy": greedy_for(tname),
                        "pure-General": Policy("General", fight="stall"),
                        "pure-White": Policy("White", fight="stall"),
                        "pure-Square": Policy("Square", fight="stall", stay=True)}
                for pn, pol in pols.items():
                    big[(Rn, tname, n, pn)] = run_cell(tname, n, pol, R, RUNS)
    # main table: greedy by reading
    for Rn in READINGS:
        W(f"\n## {Rn}: greedy policy, % per ending\n")
        W("| table | N | Генералу | Белый мандат | Площадь | ПД after 04 (D/T/C) | strike ok/fail/none | key | forced choice | fight: only Зенон / all fell / ≥1 deputy taken | avg rounds |")
        W("|---|---|---|---|---|---|---|---|---|---|---|")
        for tname in TABLES:
            for n in (6, 7, 8):
                c = big[(Rn, tname, n, "greedy")]; r = c["runs"]
                W(f"| {tname} | {n} | {pct(c['res']['General'], r)} | {pct(c['res']['White'], r)} | {pct(c['res']['Square'], r)} | "
                  f"{c['holder']['D']}/{c['holder']['T']}/{c['holder']['C']} | {c['strike']['ok']}/{c['strike']['fail']}/{c['strike']['none']} | "
                  f"{pct(c['fstat']['key'], r)} | {pct(c['forced'], r)} | {pct(c['fstat']['onlyzenon'], r)} / {pct(c['fstat']['allfell'], r)} / {pct(c['fstat']['taken'], r)} | {c['rounds']:.1f} |")
    W("\n## Reachability by deliberate («чистый») play, % of runs reaching the targeted ending\n")
    W("| reading | table | N | pure-General | pure-White | pure-Square |")
    W("|---|---|---|---|---|---|")
    for Rn in READINGS:
        for tname in TABLES:
            for n in (6, 8):
                row = []
                for E in ("General", "White", "Square"):
                    c = big[(Rn, tname, n, "pure-" + E)]
                    row.append(pct(c["res"][E], c["runs"]))
                W(f"| {Rn} | {tname} | {n} | {' | '.join(row)} |")
    W("\n## Ending by balcony choice (greedy night, all readings, 6/7/8 pooled)\n")
    W("| table | choice | runs | Генералу | Белый | Площадь |")
    W("|---|---|---|---|---|---|")
    for tname in TABLES:
        agg = defaultdict(Counter)
        for Rn in READINGS:
            for n in (6, 7, 8):
                for pn in ("greedy", "pure-General", "pure-White", "pure-Square"):
                    for (chh, e), v in big[(Rn, tname, n, pn)]["chend"].items(): agg[chh][e] += v
        for chh, cnt in sorted(agg.items()):
            tot = sum(cnt.values())
            W(f"| {tname} | {chh} | {tot} | {pct(cnt['General'], tot)} | {pct(cnt['White'], tot)} | {pct(cnt['Square'], tot)} |")
    W("\n## Hour where the outcome is decided (greedy, 6/7/8 pooled)\n")
    W("| reading | table | distribution |")
    W("|---|---|---|")
    for Rn in READINGS:
        for tname in TABLES:
            hc = Counter(); tot = 0
            for n in (6, 7, 8):
                c = big[(Rn, tname, n, "greedy")]; hc.update(c["hours"]); tot += c["runs"]
            W(f"| {Rn} | {tname} | " + ", ".join(f"{k}: {pct(v, tot)}" for k, v in sorted(hc.items())) + " |")
    W("\n## DM steps per hour (mean, greedy, R1, 6 / 8 players)\n")
    W("| table | 22 | 23 | 00 | 01 | 02 | 03 | 04 | 05 | total |")
    W("|---|---|---|---|---|---|---|---|---|---|")
    for tname in TABLES:
        for n in (6, 8):
            c = big[("R1 strict/literal", tname, n, "greedy")]
            vals = [c["steps"][h] / c["runs"] for h in ["22", "23", "00", "01", "02", "03", "04", "05"]]
            W(f"| {tname} ({n}) | " + " | ".join(f"{v:.0f}" for v in vals) + f" | {sum(vals):.0f} |")
    # fight sensitivity: package statblock (27 HP, one attack)
    W("\n## Fight sensitivity: caller roster vs package statblock\n")
    W("| roster | N | spies/guards/deputies | escort: deputies out avg / taken≥1 / all fell / key | stall-and-rush: key / ≥1 taken / all fell |")
    W("|---|---|---|---|---|")
    for sv in ("engine", "package"):
        for n in (6, 7, 8):
            for sp, gu, dp in ((START[n]["spies"], START[n]["guards"] - 1, 2), (START[n]["spies"] - 1, 0, 4)):
                e = [fight(HERO_ORDER[:n], n, sp, gu + 1, dp, True, True, "balanced", sv) for _ in range(RUNS)]
                k = [fight(HERO_ORDER[:n], n, sp, gu + 1, dp, True, True, "stall", sv) for _ in range(RUNS)]
                W(f"| {sv} | {n} | {sp}/{gu}/{dp} | {sum(x['out'] for x in e) / RUNS:.2f} / {pct(sum(x['taken'] > 0 for x in e), RUNS)} / {pct(sum(x['allfell'] for x in e), RUNS)} / {pct(sum(x['key'] for x in e), RUNS)} | "
                  f"{pct(sum(x['key'] for x in k), RUNS)} / {pct(sum(x['taken'] > 0 for x in k), RUNS)} / {pct(sum(x['allfell'] for x in k), RUNS)} |")
    # balcony option availability and silence ending (greedy)
    W("\n## Balcony options available and what silence would give (greedy, 6/7/8 pooled)\n")
    W("| reading | table | Генералу avail | Белый avail | Площадь avail | silence → Генералу / Белый / Площадь |")
    W("|---|---|---|---|---|---|")
    for Rn in READINGS:
        for tname in TABLES:
            av = Counter(); se = Counter(); tot = 0
            for n in (6, 7, 8):
                c = big[(Rn, tname, n, "greedy")]; av.update(c["avail"]); se.update(c["silend"]); tot += c["runs"]
            W(f"| {Rn} | {tname} | {pct(av['General'], tot)} | {pct(av['White'], tot)} | {pct(av['Square'], tot)} | "
              f"{pct(se['General'], tot)} / {pct(se['White'], tot)} / {pct(se['Square'], tot)} |")
    # exploits
    W("\n## Exploit probes (R1, 6 players unless noted)\n")
    W("| probe | result |")
    W("|---|---|")
    import copy
    tA = copy.deepcopy(TABLES["А «поздно понял»"]); tA["glass"]["RE"] = "S"
    TABLES["А+ложь о зелёном"] = tA
    for pn, pol in (("greedy-White", GreedyA("White", "A")), ("pure-Square", Policy("Square", fight="stall", stay=True)),
                    ("pure-General", Policy("General", fight="stall"))):
        c = run_cell("А+ложь о зелёном", 6, pol, READINGS["R1 strict/literal"], RUNS)
        W(f"| А with green glass kept by a lie (NI already 6, so the +1 for the lie burns): {pn} | "
          + ", ".join(f"{ENDING[k]} {pct(v, c['runs'])}" for k, v in c['res'].items()) + " |")
    del TABLES["А+ложь о зелёном"]
    for tname in TABLES:
        t = TABLES[tname]; h = t["h"]
        kg = sum(h[k] for k in CITYH if t["glass"][k] == "K")
        tv = h["NI"] + kg; dv = h["AR"]
        if t["warned"]: verdict = "Орен предупреждён: strike fails whatever the pairs do"
        elif h["NI"] <= 2 and t["glass"]["RE"] != "K": verdict = "no strike"
        else: verdict = f"Thread wins alone: {tv >= dv}; three pairs stacked with the Dawn ({dv + 6}) flip it: {tv < dv + 6}"
        W(f"| 04:00 strike, {tname}: NI + Кассия's glasses = {tv} vs AR {dv} | {verdict} |")
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "results-tables.md"), "w") as f:
        f.write("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
