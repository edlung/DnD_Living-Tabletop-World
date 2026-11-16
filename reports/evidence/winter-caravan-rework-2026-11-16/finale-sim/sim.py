#!/usr/bin/env python3
"""Evening-8 run through the Белый Желоб, simulated strictly from the campaign text.

Sources (campaigns/collection-2026/winter-caravan/): handouts run-rules, run-card, run-know,
run-dm-card, run-dm-slide, food-warmth-sheet; session-7/8; source/world.json endings.
Nothing here edits the campaign. Run: python3 sim.py [runs_per_cell] > out.json
"""
import json, random, sys, itertools, statistics, copy, zlib

G1, G2, G3, G4, K = 1, 2, 3, 4, 5
WNAME = {1: 'Г1', 2: 'Г2', 3: 'Г3', 4: 'Г4', 5: 'К'}

# heroes: name, class, max hp, Athletics (assumption: fighter Str 16+prof, others no prof)
HEROES = [('Остап', 'fighter', 31, 5), ('Кея', 'rogue', 24, 0), ('Ольма', 'cleric', 24, 1),
          ('Севар', 'wizard', 20, -1), ('Тирна', 'fighter', 31, 5), ('Леврин', 'rogue', 24, 0),
          ('Эйра', 'cleric', 24, 1), ('Юст', 'wizard', 20, -1)]
NPCS = [('Бреша', 51), ('Тарма', 44), ('Сельда', 36), ('Херет', 58), ('Вавила', 52),
        ('Глафира', 33), ('Малкен', 24)]

# Rule levers (defaults = the campaign text as it is now). tuned.py overrides them.
RULES = dict(run_only=False,        # (a) endings count only people lost in the run
             noise_from=G4,         # (b) bites in the Желоб are noise from this ridge mark on
             pack_dist=(3,),        # (c) pack moves one of these (equally likely) per turn
             people_only=False,     # (c) pack goes to the rearmost section with PEOPLE; unled mule goes down by itself
             otrog_max=2,           # (e)
             mule_zhelob=2,         # (d) led mule / нарта speed in the Желоб
             walker_zhelob=2,
             gorlo_from7=False)     # (d) the Горло is entered only from section 7       # (d) walker speed in the Желоб

MAIN_READINGS = dict(otrog_arrival='delays', otrog_bitable=True, down_rides=False, slide_fire='next', hero_hit_counts=False)


class Person:
    def __init__(s, name, hero, cls=None, hp=0, ath=0):
        s.name, s.hero, s.cls, s.maxhp, s.hp, s.ath = name, hero, cls, hp, hp, ath
        s.weak = s.frost = s.down = s.buried = False
        s.state, s.sec = 'run', 0
        s.slots = 4 if cls == 'cleric' else 0
        s.dug_turn = None
        s.job = None          # rescue job after the slide
        s.unit = None

    @property
    def hand(s):
        return s.state == 'run' and not (s.down or s.buried or s.weak or s.frost)

    def on_feet(s):
        return s.state == 'run' and not s.down and not s.buried and not (s.frost and not s.hero)


class Mule:
    def __init__(s, i):
        s.id, s.state, s.sec = i, 'run', 0


class Unit:
    """kind: walk | mule | narta | sledge | carry | stay (unled mule or a person left standing)."""
    def __init__(s, kind, sec=0, persons=(), mules=(), boxes=0, rider=None, follow=None):
        s.kind, s.sec = kind, sec
        s.persons = list(persons)   # movers (leader, pullers, carriers, walker)
        s.mules = list(mules)
        s.rider = rider             # rider on mule/narta, or carried person
        s.riders = []               # sledge riders
        s.boxes = boxes
        s.follow = follow
        s.alive = True
        s.gorlo_wait = 0

    def everyone(s):
        r = list(s.persons)
        if s.rider: r.append(s.rider)
        return r + s.riders

    def speed(s, st):
        sec = s.sec
        if s.kind == 'stay':
            return 0
        if s.kind == 'sledge':
            m = len([x for x in s.mules if x.state == 'run'])
            p = len([x for x in s.persons if x.hand])
            if sec >= 9:
                return 3
            if sec == 8:
                return 3 if st.rope else (0 if s.gorlo_wait == 0 else 3)
            full = m >= 2 and p >= 4
            half = (m >= 2 and p >= 2) or (m >= 1 and p >= 4)
            if sec <= 3:
                return 2 if full else (1 if half else 0)
            return 1 if (full or half) else 0
        if s.kind == 'carry':
            v = 1
            if st.horn_on and 9 <= sec <= 11: v = 2
            return v
        if s.kind == 'walk':
            p = s.persons[0]
            if p.weak or (p.frost and p.hero):
                if st.horn_on and 9 <= sec <= 11: return 2
                return 1
            return RULES['walker_zhelob'] if 4 <= sec <= 7 and not st.slid else 2
        return RULES['mule_zhelob'] if 4 <= sec <= 7 and not st.slid else 2  # mule (led), narta (two pullers)

    def move(s, st):
        v = s.speed(st)
        if v <= 0:
            if s.kind == 'sledge' and s.sec == 8: s.gorlo_wait = 1
            return
        new = s.sec + v
        if s.kind == 'sledge' and s.sec <= 3 and new > 4: new = 4   # enters the Желоб no further than 4
        if s.kind == 'sledge' and s.sec <= 7 and new > 8: new = 8
        if RULES['gorlo_from7'] and not st.slid and s.sec <= 6 and new > 7: new = 7
        if RULES.get('hold_gorlo') and not st.slid and new > 8: new = max(8, s.sec)
        if s.kind == 'walk' and s.follow is not None and s.follow.alive and s.follow.sec < 8:
            new = min(new, max(s.follow.sec, s.sec))
        s.sec = min(12, new)
        for p in s.everyone(): p.sec = s.sec
        for m in s.mules: m.sec = s.sec


class State:
    pass


def make_state(start, plan, rd, rng):
    st = State()
    st.rd, st.plan, st.rng = rd, plan, rng
    st.persons = []
    for (n, c, hp, a) in HEROES[:start['heroes']]:
        p = Person(n, True, c, hp, a)
        p.hp = max(1, hp - start.get('hero_dmg', {}).get(n, 0))
        st.persons.append(p)
    for (n, age) in NPCS:
        if n in start['departed']: continue
        p = Person(n, False)
        p.age = age
        p.weak = n in start['weak']
        p.frost = n in start['frost']
        st.persons.append(p)
    st.predeparted = len(start['departed'])
    st.mules = [Mule(i) for i in range(start['mules'])]
    st.fire, st.sacks = start['fire'], start['sacks']
    st.cargo = start['boxes'] + start['bales']
    st.boxes0 = start['boxes']
    st.hero_weakness = start['hero_weakness']
    st.learned = start['learned']
    st.white = start['white']
    st.white_arrived_K = None
    st.otrog_prev = None      # turn index of an Otrog fire lit in the previous turn
    st.otrog_used = 0
    st.standing = False
    st.pack = -1
    st.pack_alive = True
    st.slid = False
    st.slide_turn = None
    st.white_slide = dict(active=False, turns=0, victims=0)
    st.protect = set()
    st.horn = False; st.horn_on = False; st.horn_turn = None
    st.rope = True
    st.knife = True
    st.t = 0
    st.log = []
    st.decisions = []
    st.live = []
    st.fire_used = 0; st.sacks_used = 0
    st.noise_slide = False
    st.bites = 0; st.mules_bitten = 0
    st.passed = False
    st.units = []
    dawn_assign(st)
    return st


# ---------------------------------------------------------------- dawn plan
def dawn_assign(st):
    plan = st.plan
    hands = [p for p in st.persons if p.hand]
    npc_hands = [p for p in hands if not p.hero]
    hero_hands = [p for p in hands if p.hero]
    mules = list(st.mules)
    cargo = st.cargo if plan.get('cargo', True) else 0
    U = st.units

    def pick(prefer_npc=True):
        pool = (npc_hands, hero_hands) if prefer_npc else (hero_hands, npc_hands)
        for q in pool:
            if q:
                return q.pop(0)
        return None

    def nhands():
        return len(npc_hands) + len(hero_hands)

    frost = [p for p in st.persons if p.frost and not p.hero]
    slow = [p for p in st.persons if (p.weak and not p.hero) or (p.frost and p.hero)]
    # 1. one sledge (Новые сани) with 2 mules and 4 pullers, carrying cargo
    if plan.get('sledge') and len(mules) >= 2 and nhands() >= 4:
        u = Unit('sledge', persons=[pick() for _ in range(4)], mules=[mules.pop(), mules.pop()])
        u.boxes = min(4, cargo); cargo -= u.boxes
        u.gorlo_wait = 0
        U.append(u)
    # 2. riders on mules: frostbitten first, then weakened
    needy = frost + slow
    rest = []
    for p in needy:
        if mules and nhands() >= 1:
            U.append(Unit('mule', persons=[pick()], mules=[mules.pop()], rider=p))
        else:
            rest.append(p)
    # 3. the нарта (two pullers, one rider)
    if rest and nhands() >= 2:
        p = rest.pop(0)
        U.append(Unit('narta', persons=[pick(), pick()], rider=p))
    # 4. what is left of the needy
    for p in rest:
        if p.frost and not p.hero:
            if plan.get('carry_slow') and nhands() >= 2:
                U.append(Unit('carry', persons=[pick(), pick()], rider=p))
            else:
                p.stay_put = True
                U.append(Unit('stay', persons=[p]))
        else:
            if plan.get('leave_slow'):
                p.stay_put = True
                U.append(Unit('stay', persons=[p]))
            else:
                U.append(Unit('walk', persons=[p]))
    # 5. cargo on mules, then on backs
    reserve = 2
    while cargo > 0 and mules and nhands() >= 1:
        b = min(2, cargo); cargo -= b
        U.append(Unit('mule', persons=[pick()], mules=[mules.pop()], boxes=b))
    if cargo > 0 and nhands() >= 2 + reserve and not any(u.kind == 'narta' for u in U):
        b = min(2, cargo); cargo -= b
        U.append(Unit('narta', persons=[pick(), pick()], boxes=b))
    while cargo > 0 and plan.get('carry_boxes', True) and nhands() > reserve:
        cargo -= 1
        U.append(Unit('walk', persons=[pick(False)], boxes=1))
    st.cargo_left = cargo
    # 6. spare mules: led (main policy) or left standing at the Площадка (decoy exploit)
    for m in mules:
        if not plan.get('decoy') and plan.get('lead_spare', True) and nhands() > reserve:
            U.append(Unit('mule', persons=[pick()], mules=[m]))
        elif RULES['people_only']:
            m.state = 'lost'
        else:
            U.append(Unit('stay', mules=[m]))
    # 7. free walkers; escorts for the slowest moving unit
    slow_units = [u for u in U if u.kind in ('carry', 'sledge') or (u.kind == 'walk' and u.speed(st) == 1)]
    free = [pick(False) for _ in range(nhands())]
    for p in free:
        f = None
        if slow_units and plan.get('escort', 0) > 0:
            cnt = sum(1 for u in U if u.kind == 'walk' and u.follow is slow_units[0])
            if cnt < plan['escort']:
                f = slow_units[0]
        U.append(Unit('walk', persons=[p], follow=f))
    for u in U:
        for p in u.everyone(): p.unit = u
        for m in u.mules: m.unit = u


# ---------------------------------------------------------------- helpers
def live_units(st):
    return [u for u in st.units if u.alive]


def is_free(p):
    u = p.unit
    return p.hand and u is not None and u.kind == 'walk' and u.boxes == 0


def rearmost(st, pos=None, exclude=()):
    """lowest section with people or mules (not buried, not out); lone lying people are skipped."""
    secs = {}
    for p in st.persons:
        if p.state != 'run' or p.buried or p in exclude: continue
        s = pos.get(id(p), p.sec) if pos else p.sec
        if s >= 12: continue
        secs.setdefault(s, []).append(p)
    for m in st.mules:
        if m.state != 'run' or RULES['people_only']: continue
        s = pos.get(id(m), m.sec) if pos else m.sec
        if s >= 12: continue
        secs.setdefault(s, []).append(m)
    for s in sorted(secs):
        ents = secs[s]
        if all(isinstance(e, Person) and e.down for e in ents):
            continue
        return s
    return None


def tentative_positions(st, stayers):
    pos = {}
    saved = []
    for u in live_units(st):
        saved.append((u, u.sec, getattr(u, 'gorlo_wait', 0)))
    # move non-followers first, followers after (they cap at their target)
    order = sorted(live_units(st), key=lambda u: u.follow is not None)
    for u in order:
        if any(p in stayers for p in u.persons):
            continue
        u.sec_before = u.sec
        v = u.speed(st)
        new = u.sec + max(0, v)
        if u.kind == 'sledge' and u.sec <= 3 and new > 4: new = 4
        if u.kind == 'sledge' and u.sec <= 7 and new > 8: new = 8
        if RULES['gorlo_from7'] and not st.slid and u.sec <= 6 and new > 7: new = 7
        if RULES.get('hold_gorlo') and not st.slid and new > 8: new = max(8, u.sec)
        if u.kind == 'walk' and u.follow is not None and u.follow.alive and u.follow.sec < 8:
            tgt = pos.get(('u', id(u.follow)), u.follow.sec)
            new = min(new, max(tgt, u.sec))
        new = min(12, new)
        pos[('u', id(u))] = new
        for p in u.everyone(): pos[id(p)] = new
        for m in u.mules: pos[id(m)] = new
    return pos


def project_endangered(st, slide_turn, stayers_now):
    """people who would not be on 8+ at the end of slide_turn, by plain unit speeds."""
    n = 0
    for u in live_units(st):
        sec = u.sec
        wait = getattr(u, 'gorlo_wait', 0)
        moves = slide_turn - st.t + 1
        if any(p in stayers_now for p in u.persons):
            moves -= 1
        for _ in range(max(0, moves)):
            saved = u.sec
            u.sec = sec
            v = u.speed(st)
            u.sec = saved
            new = sec + max(0, v)
            if u.kind == 'sledge' and sec <= 3 and new > 4: new = 4
            if u.kind == 'sledge' and sec <= 7 and new > 8: new = 8
            if RULES['gorlo_from7'] and sec <= 6 and new > 7: new = 7
            sec = min(12, new)
        if sec < 8:
            n += len([p for p in u.everyone() if p.state == 'run' and not p.buried])
    return n


def projected_slide(st, fire_now):
    w, prev, used = st.white, (st.t if fire_now else None), st.otrog_used + (1 if fire_now else 0)
    arrived = st.white_arrived_K
    t = st.t
    while True:
        t += 1
        if t > 12: return 12
        if w == K:
            eff = prev is not None and (st.rd['otrog_arrival'] == 'delays' or arrived != prev)
            prev = None
            if not eff:
                return t
        elif prev is not None:
            prev = None
        else:
            w += 1
            if w == K: arrived = t


# ---------------------------------------------------------------- one turn before the slide
def white_step(st):
    t = st.t
    st.standing = False
    if st.white == K:
        eff = st.otrog_prev is not None and (st.rd['otrog_arrival'] == 'delays' or st.white_arrived_K != st.otrog_prev)
        if not eff:
            st.standing = True
    elif st.otrog_prev is not None:
        pass
    else:
        st.white += 1
        if st.white == K: st.white_arrived_K = t
    st.otrog_prev = None


def heal_step(st):
    for p in st.persons:
        if p.state == 'run' and p.down and not p.buried:
            for c in st.persons:
                if c.cls == 'cleric' and c.state == 'run' and not c.down and not c.buried and c.slots > 0 and c.sec == p.sec and c is not p:
                    c.slots -= 1; p.down = False
                    if p.hero: p.hp = 6
                    st.log.append(f"Т{st.t}: {c.name} — Лечащее слово, {p.name} на ногах")
                    break


def repair_units(st):
    """after a bite/down: re-form what can be re-formed inside one section."""
    for u in live_units(st):
        if u.kind == 'mule':
            if not u.mules or u.mules[0].state != 'run':
                dissolve(st, u)
            elif not u.persons[0].hand:
                # leader down: try a free hand in the same section
                rep = [p for p in st.persons if is_free(p) and p.sec == u.sec]
                if rep:
                    take_over(st, rep[0], u, 0)
                else:
                    dissolve(st, u)
        elif u.kind in ('narta', 'carry'):
            bad = [i for i, p in enumerate(u.persons) if not p.hand]
            for i in bad:
                rep = [p for p in st.persons if is_free(p) and p.sec == u.sec]
                if rep: take_over(st, rep[0], u, i)
            if any(not p.hand for p in u.persons):
                dissolve(st, u)
        elif u.kind == 'walk':
            p = u.persons[0]
            if p.down or p.state != 'run':
                u.alive = False
                if p.state == 'run':
                    nu = Unit('stay', sec=u.sec, persons=[p]); p.unit = nu; st.units.append(nu)
        elif u.kind == 'sledge':
            for i, p in enumerate(list(u.persons)):
                if not p.hand:
                    u.persons.remove(p)
                    if p.state == 'run':
                        nu = Unit('stay', sec=u.sec, persons=[p]); p.unit = nu; st.units.append(nu)
        elif u.kind == 'stay':
            for p in u.persons:
                if getattr(p, 'stay_put', False): continue
                if p.hand or (p.weak and not p.down):
                    u.alive = False
                    nu = Unit('walk', sec=u.sec, persons=[p]); p.unit = nu; st.units.append(nu)
    # downed people lying alone: carry by two free hands, or ride a spare mule (reading)
    for p in st.persons:
        if p.state == 'run' and p.down and not p.buried and p.unit and p.unit.kind == 'stay':
            free = [q for q in st.persons if is_free(q) and q.sec == p.sec]
            if st.rd['down_rides']:
                sm = [u for u in live_units(st) if u.kind == 'mule' and u.sec == p.sec and u.rider is None and u.boxes == 0]
                if sm:
                    p.unit.alive = False; sm[0].rider = p; p.unit = sm[0]
                    continue
            if len(free) >= 2:
                p.unit.alive = False
                for q in free[:2]: q.unit.alive = False
                nu = Unit('carry', sec=p.sec, persons=free[:2], rider=p)
                for q in nu.everyone(): q.unit = nu
                st.units.append(nu)


def take_over(st, newp, u, i):
    newp.unit.alive = False
    u.persons[i] = newp
    newp.unit = u


def dissolve(st, u):
    u.alive = False
    for p in u.persons:
        if p.state == 'run':
            nu = Unit('walk' if p.hand else 'stay', sec=u.sec, persons=[p]); p.unit = nu; st.units.append(nu)
    if u.rider is not None and u.rider.state == 'run':
        p = u.rider
        nu = Unit('walk' if (p.hand or (p.weak and not p.down)) else 'stay', sec=u.sec, persons=[p]); p.unit = nu; st.units.append(nu)
    for m in u.mules:
        if m.state == 'run':
            if RULES['people_only']:
                m.state = 'lost'; continue
            nu = Unit('stay', sec=u.sec, mules=[m]); m.unit = nu; st.units.append(nu)


def otrog_step(st, stayers):
    rd, plan = st.rd, st.plan
    avail = st.fire > 0 and st.otrog_used < RULES['otrog_max'] and st.learned and st.otrog_used < plan.get('otrog', 0)
    if not avail or st.standing: return None
    cands = [p for p in st.persons if is_free(p) and 2 <= p.sec <= 5 and p not in stayers]
    if not cands: return None
    s0 = projected_slide(st, False)
    s1 = projected_slide(st, True)
    st.decisions[-1] += 1
    if s1 <= s0: return None
    cands.sort(key=lambda p: (-p.sec, not p.hero, -p.hp))
    lighter = cands[0]
    e0 = project_endangered(st, s0, set())
    e1 = project_endangered(st, s1, {lighter})
    if e1 >= e0 and not plan.get('otrog_always'): return None
    st.fire -= 1; st.fire_used += 1; st.otrog_used += 1
    st.otrog_prev_pending = st.t
    st.log.append(f"Т{st.t}: огонь на Отроге — {lighter.name} с участка {lighter.sec} (Белая {WNAME[st.white]})")
    return lighter


def cheap_victim(st, sec, pos):
    for p in st.persons:
        if p.state == 'run' and not p.buried and not p.down and pos.get(id(p), p.sec) == sec:
            if p.hero and p.hp > 7: return True
    for m in st.mules:
        if m.state == 'run' and pos.get(id(m), m.sec) == sec:
            u = m.unit
            if u.kind == 'stay' or (u.kind == 'mule' and u.rider is None and u.boxes == 0): return True
    return False


def tail_step(st, stayers, otrog_lighter):
    """decide tail fire / sack / decoy. returns (kind, person|mule) or None"""
    if not st.pack_alive: return None
    excl = () if st.rd['otrog_bitable'] else (otrog_lighter,)
    pos = tentative_positions(st, stayers)
    R = rearmost(st, pos, excl)
    if R is None or R >= 8: return None
    dist = RULES['pack_dist']
    p_reach = sum(1 for m in dist if st.pack + m >= R) / len(dist)
    if p_reach == 0: return None
    noise = 4 <= R <= 7 and st.white >= RULES['noise_from'] and not st.standing
    cheap = cheap_victim(st, R, pos)
    opts = []
    # decoy: leave a spare mule standing on the Морена (exploit mode only)
    if st.plan.get('decoy'):
        for u in live_units(st):
            if u.kind == 'mule' and u.rider is None and u.boxes == 0 and u.sec <= 3 and u.sec <= R and st.pack <= u.sec:
                opts.append(('decoy', u)); break
            if u.kind == 'stay' and u.mules and not u.persons and u.sec <= 3 and u.sec <= R and st.pack <= u.sec:
                opts.append(('decoy', u)); break
    cands = []
    for p in st.persons:
        if p.state != 'run' or p in stayers or p.buried or p.down: continue
        if not (is_free(p) or (p.weak and p.unit and p.unit.kind == 'walk')): continue
        pos2 = dict(pos); pos2[id(p)] = p.sec
        if rearmost(st, pos2, excl) == p.sec and p.sec >= st.pack:
            cands.append(p)
    cands.sort(key=lambda p: (-p.sec, not p.hero, -p.hp))
    if noise and st.plan.get('rearguard') and not any(getattr(p, 'rearguard', False) for p in st.persons):
        rg = [p for p in cands if p.hero and p.sec <= 3 and p.hp > 7]
        if rg:
            rg.sort(key=lambda p: -p.hp)
            return ('rearguard', rg[0])
    reserve = max(0, st.plan.get('otrog', 0) - st.otrog_used) if st.learned else 0
    fire_c = [p for p in cands if p.hand]
    if fire_c and st.fire > 0: opts.append(('fire', fire_c[0]))
    if cands and st.sacks > 0: opts.append(('sack', cands[0]))
    if cheap or not noise: opts.append(('bite', None))
    if len(opts) >= 2: st.decisions[-1] += 1
    if not (noise or not cheap):
        return None
    if p_reach < 1 and p_reach < st.plan.get('gamble', 0.01):
        return None
    if RULES.get('fire_die') and noise:
        opts.sort(key=lambda o: {'decoy': 0, 'sack': 1, 'fire': 2, 'bite': 3}[o[0]])
    for kind, who in opts:
        if kind == 'decoy':
            return ('decoy', who)
        if kind == 'fire' and (noise or st.fire > reserve):
            return ('fire', who)
        if kind == 'sack':
            return ('sack', who)
    return None


def bite(st, sec):
    st.bites += 1
    ents_p = [p for p in st.persons if p.state == 'run' and not p.buried and p.sec == sec]
    ents_m = [m for m in st.mules if m.state == 'run' and m.sec == sec]
    cats = 0
    heroes = sorted([p for p in ents_p if p.hero and not p.down and p.hp > 7], key=lambda p: -p.hp)
    spare = [m for m in ents_m if m.unit.kind == 'stay' or (m.unit.kind == 'mule' and m.unit.rider is None and m.unit.boxes == 0)]
    clerics = [c for c in ents_p if c.cls == 'cleric' and not c.down and c.slots > 0]
    npcs_ok = [p for p in ents_p if not p.hero and p.hand]
    cats = sum(bool(x) for x in (heroes, spare, npcs_ok))
    if cats >= 2: st.decisions[-1] += 1
    if heroes:
        p = heroes[0]; p.hp -= 7
        st.log.append(f"Т{st.t}: укус на {sec} — {p.name} −7 ({p.hp})"); return
    if spare:
        m = spare[0]; m.state = 'lost'; st.mules_bitten += 1
        st.log.append(f"Т{st.t}: укус на {sec} — мул рвёт повод и уходит вниз"); return
    tir = [p for p in ents_p if p.name == 'Тирна' and not p.down]
    loaded = [m for m in ents_m if m.unit.kind == 'mule' and m.unit.rider is None and m.unit.boxes > 0]
    if loaded and tir and st.knife:
        st.knife = False; loaded[0].unit.boxes = 0
        st.log.append(f"Т{st.t}: укус на {sec} — нож Тирны: вьюк срезан, мул остаётся"); return
    if npcs_ok and clerics:
        p = npcs_ok[0]; p.down = True
        st.log.append(f"Т{st.t}: укус на {sec} — {p.name} сбит (лекарь рядом)"); return
    if loaded:
        m = loaded[0]; m.state = 'lost'; st.mules_bitten += 1
        st.log.append(f"Т{st.t}: укус на {sec} — мул с грузом уходит вниз"); return
    h2 = [p for p in ents_p if p.hero and not p.down]
    if h2:
        p = h2[0]; p.hp = 0; p.down = True
        st.log.append(f"Т{st.t}: укус на {sec} — {p.name} сбит"); return
    n2 = [p for p in ents_p if not p.hero and not p.down]
    if n2:
        p = n2[0]; p.down = True
        st.log.append(f"Т{st.t}: укус на {sec} — {p.name} (NPC) сбит"); return
    rid = [m for m in ents_m]
    if rid:
        m = rid[0]; m.state = 'lost'; st.mules_bitten += 1
        st.log.append(f"Т{st.t}: укус на {sec} — мул с седоком уходит вниз"); return


def pre_slide_turn(st):
    st.decisions.append(0)
    if any(p.state == 'run' and 2 <= p.sec <= 3 and p.unit is not None and p.unit.kind in ('walk', 'carry', 'stay')
           and p.unit.speed(st) == 1 and not p.down for p in st.persons):
        st.decisions[-1] += 1   # slow people at the edge of the Желоб: push on or stay on the Морена
    white_step(st)
    heal_step(st)
    repair_units(st)
    stayers = set()
    st.otrog_prev_pending = None
    # pass the pack
    passing = False
    if st.pack_alive and st.learned and st.plan.get('pass') and not st.passed:
        allin = all(p.sec <= 3 for p in st.persons if p.state == 'run') and all(m.sec <= 3 for m in st.mules if m.state == 'run')
        if allin:
            st.decisions[-1] += 1
            if st.t >= st.plan.get('pass_turn', 1):
                passing = True; st.passed = True
                st.log.append(f"Т{st.t}: стаю пропускают на Морене (Белая {WNAME[st.white]})")
    if passing:
        st.pack_alive = False
        st.otrog_prev = None
        if st.standing:
            do_slide(st)
        return
    for p in st.persons:
        if getattr(p, 'rearguard', False) and p.state == 'run':
            stayers.add(p)
    lighter = otrog_step(st, stayers)
    if lighter: stayers.add(lighter)
    tail = tail_step(st, stayers, lighter)
    fire_sec = sack_sec = None
    decoy_unit = None
    if tail:
        kind, who = tail
        if kind == 'decoy':
            u = who
            if u.kind == 'mule':
                ld = u.persons[0]
                u.kind = 'stay'; u.persons = []
                nu = Unit('walk', sec=u.sec, persons=[ld]); ld.unit = nu; st.units.append(nu)
            decoy_unit = u
            st.log.append(f"Т{st.t}: мул оставлен без повода на {u.sec} (приманка)")
        elif kind == 'rearguard':
            who.rearguard = True
            stayers.add(who)
            st.log.append(f"Т{st.t}: {who.name} остаётся заслоном на Морене ({who.sec})")
        else:
            stayers.add(who)
            if kind == 'fire':
                st.fire -= 1; st.fire_used += 1; fire_sec = who.sec
                st.log.append(f"Т{st.t}: огонь в хвосте — {who.name} на {who.sec} (Белая {WNAME[st.white]})")
            else:
                st.sacks -= 1; st.sacks_used += 1; sack_sec = who.sec
                st.log.append(f"Т{st.t}: мешок стае — {who.name} на {who.sec}")
    # move
    order = sorted(live_units(st), key=lambda u: u.follow is not None)
    for u in order:
        if any(p in stayers for p in u.persons): continue
        u.move(st)
    # pack
    noise = False
    if st.pack_alive:
        excl = () if st.rd['otrog_bitable'] else (lighter,)
        R = rearmost(st, None, excl)
        mv = RULES['pack_dist'][0] if len(RULES['pack_dist']) == 1 else st.rng.choice(RULES['pack_dist'])
        if R is None or R >= 8:
            if st.pack + mv >= 8: st.pack_alive = False
            else: st.pack += mv
        elif (R < st.pack and st.pack - mv <= R) or (R >= st.pack and st.pack + mv >= R):
            held = True
            if fire_sec == R and RULES.get('fire_die'):
                held = st.rng.randint(1, 6) <= 4
                st.fire_rolls = getattr(st, 'fire_rolls', 0) + 1
                if not held:
                    st.fire_fails = getattr(st, 'fire_fails', 0) + 1
                    st.log.append(f"Т{st.t}: к6 = 5–6, стая проходит огонь на {R}")
            if fire_sec == R and held:
                st.pack = R - 1
            elif fire_sec == R and not held and RULES.get('fire_pass') == 'next':
                excl2 = set(excl) | {p for p in st.persons if p.sec == R}
                R2 = rearmost(st, None, tuple(excl2))
                if R2 is not None and R2 < 8 and st.pack + mv >= R2:
                    st.pack = R2; bite(st, R2)
                    if 4 <= R2 <= 7: noise = True
                else:
                    st.pack = R
            elif sack_sec == R:
                st.pack = R
            else:
                st.pack = R
                bite(st, R)
                if 4 <= R <= 7: noise = True
        elif R < st.pack:
            st.pack -= mv
        else:
            st.pack += mv
    st.otrog_prev = st.otrog_prev_pending
    if noise and st.white >= RULES['noise_from'] and not st.standing:
        st.noise_slide = True
        st.log.append(f"Т{st.t}: укус в Желобе — шум, Белая {WNAME[st.white]}: сход")
        do_slide(st)
    elif st.standing or (noise and st.white >= RULES['noise_from']):
        do_slide(st)


def do_slide(st):
    st.slid = True; st.slide_turn = st.t
    cut = [p for p in st.persons if p.state == 'run' and p.sec <= 3]
    st.log.append(f"Т{st.t}: СХОД. " + ', '.join(f"{p.name}@{p.sec}" for p in st.persons if p.state == 'run' and p.sec < 8))
    on_feet = any(p.on_feet() for p in cut)
    for p in cut:
        p.state = 'cutoff' if on_feet else 'slope'
    for p in st.persons:
        if p.state == 'run' and 4 <= p.sec <= 7:
            p.buried = True
    for u in live_units(st):
        if u.sec <= 7:
            u.alive = False
            for m in u.mules:
                if m.state == 'run': m.state = 'buried' if u.sec >= 4 else 'lost'
            u.boxes = 0
    for m in st.mules:
        if m.state == 'run' and m.sec <= 7:
            m.state = 'buried' if m.sec >= 4 else 'lost'
    st.pack_alive = False
    st.white_slide = dict(active=True, turns=0, victims=0)


# ---------------------------------------------------------------- after the slide
def post_slide_turn(st):
    st.decisions.append(0)
    t = st.t
    ws = st.white_slide
    if st.horn and st.horn_turn is not None and t > st.horn_turn: st.horn_on = True
    # step 1: the White on the Завал
    if ws['active'] and ws['turns'] < 3 and ws['victims'] < 2:
        ws['turns'] += 1
        prot = st.protect if st.rd['slide_fire'] == 'next' else set()
        cand = []
        for p in st.persons:
            if p.state == 'run' and not p.hero and 4 <= p.sec <= 7 and p.sec not in prot:
                pr = 0 if (p.down or p.frost) else (1 if p.weak else 2)
                cand.append((pr, -p.sec, 0, p))
        for m in st.mules:
            if m.state in ('buried', 'run') and 4 <= m.sec <= 7 and m.sec not in prot:
                cand.append((3, -m.sec, 1, m))
        cand.sort(key=lambda x: (x[0], x[1], x[2]))
        if cand:
            v = cand[0][3]
            guards = [h for h in st.persons if h.hero and h.state == 'run' and not h.buried and not h.down and h.sec == v.sec and h.hp > 11]
            if len(cand) + 0 >= 1 and guards: st.decisions[-1] += 1
            if guards:
                g = guards[0]; g.hp -= 11; ws['victims'] += 1
                st.log.append(f"Т{t}: Белая на завале — заслон {g.name} (−11), жертва засчитана")
            else:
                ws['victims'] += 1
                v.state = 'taken'
                st.log.append(f"Т{t}: Белая забирает {'мула' if isinstance(v, Mule) else v.name} с {v.sec}")
        else:
            bh = [p for p in st.persons if p.hero and p.state == 'run' and p.buried and 4 <= p.sec <= 7 and p.sec not in prot and not p.down]
            if bh:
                p = sorted(bh, key=lambda p: -p.sec)[0]
                p.hp = max(0, p.hp - 11)
                if p.hp == 0: p.down = True
                if st.rd.get('hero_hit_counts'): ws['victims'] += 1
                st.log.append(f"Т{t}: Белая — засыпанному {p.name} 11 урона")
        if ws['turns'] >= 3 or ws['victims'] >= 2:
            ws['active'] = False
    st.protect = set()
    # step 2
    if not st.horn and any(p.on_feet() and p.sec >= 8 for p in st.persons):
        st.horn = True; st.horn_turn = t
    heal_step(st)
    # self-dig
    for p in st.persons:
        if p.state == 'run' and p.hero and p.buried and not p.down:
            r = st.rng.randint(1, 20)
            if st.hero_weakness: r = min(r, st.rng.randint(1, 20))
            st.decisions[-1] += 0
            if r + p.ath >= 12:
                p.buried = False; p.dug_turn = t
                st.log.append(f"Т{t}: {p.name} откапывается сам на {p.sec}")
    # rescue planning: heroes on 8 go down to buried people if they can get back by turn 10
    rescuers = [p for p in st.persons if p.hero and p.state == 'run' and p.sec == 8 and not p.down and not p.buried and p.job is None]
    targets = [p for p in st.persons if p.state == 'run' and p.buried and p.job is None and not getattr(p, 'targeted', False)]
    targets.sort(key=lambda p: -p.sec)
    for tg in targets:
        d = 8 - tg.sec
        if t + 2 * d > 10: continue
        team = []
        if rescuers:
            st.decisions[-1] += 1
            need_cleric = not tg.hero
            cl = [r for r in rescuers if r.cls == 'cleric' and r.slots > 0]
            if need_cleric and cl:
                team = [cl[0]]
                others = [r for r in rescuers if r is not cl[0]]
                if others: team.append(others[0])
            elif need_cleric:
                team = rescuers[:2] if len(rescuers) >= 2 else []
            else:
                cl2 = [r for r in rescuers if r.cls == 'cleric' and r.slots > 0]
                team = (cl2[:1] or rescuers[:1]) if not RULES.get('hold_gorlo') else (cl2[:1] + [r for r in rescuers if r not in cl2[:1]][:1] if cl2 else rescuers[:2])
        if not team: continue
        tg.targeted = True
        for r in team:
            rescuers.remove(r)
            r.job = dict(target=tg, phase='down')
    # torch over the slide: a rescuer standing at a victim section lights it (instead of move)
    torch_used = set()
    for r in st.persons:
        j = r.job
        if not j or r.state != 'run': continue
        tg = j['target']
        if j['phase'] == 'down':
            if r.sec > tg.sec:
                r.sec -= 1
            if r.sec == tg.sec:
                j['phase'] = 'dig'
        elif j['phase'] == 'dig':
            if tg.buried and RULES.get('dig_roll') and st.rng.randint(1, 20) + r.ath < 12:
                continue
            if tg.buried:
                tg.buried = False; tg.dug_turn = t
                if not tg.hero: tg.down = True
                st.log.append(f"Т{t}: {r.name} откапывает {tg.name} на {tg.sec}")
                for q in st.persons:
                    if q.job and q.job['target'] is tg: q.job['phase'] = 'dug'
                if ws['active'] and st.fire > 0 and tg.sec not in st.protect:
                    others = [q for q in st.persons if q.job and q.job['target'] is tg and q is not r]
                    if others:
                        st.fire -= 1; st.fire_used += 1; st.protect.add(tg.sec); torch_used.add(others[0])
                        st.log.append(f"Т{t}: огонь над завалом на {tg.sec}")
            else:
                j['phase'] = 'up'
        elif j['phase'] in ('dug', 'up'):
            j['phase'] = 'up'
    # healing of dug NPCs by cleric in team
    heal_step(st)
    # movement
    for p in st.persons:
        if p.state != 'run' or p.buried: continue
        if p.job and p.job['phase'] in ('down', 'dig', 'dug'):
            continue
        if p.job and p.job['phase'] == 'up':
            tg = p.job['target']
            if tg.state != 'run':
                p.job = None
            elif tg.down and not tg.buried:
                # carry with a teammate (two carriers) at speed 1
                mates = [q for q in st.persons if q.job and q.job['target'] is tg and q.state == 'run']
                if p.job.get('moved') == t:
                    continue
                if len(mates) < 2:
                    p.job = None
                    if p.sec < 8: p.sec += 1
                    continue
                if len(mates) >= 2:
                    for q in mates:
                        if q.sec < 8: q.sec += 1
                    tg.sec = min(8, tg.sec + 1)
                    for q in mates: q.job['moved'] = t
                continue
            else:
                if p.sec < 8: p.sec += 1
                if p.sec >= 8 and tg.sec >= 8: p.job = None
                continue
        if 4 <= p.sec <= 7:
            if p.down: continue
            if p.dug_turn is not None and p.dug_turn >= t: continue
            if any(q.job and q.job['target'] is p and q.job.get('moved') == t for q in st.persons):
                continue
            p.sec += 1
            continue
        if p.sec >= 8 and p.sec < 12 and not p.job:
            if p.down: continue
            v = 1 if (p.weak or p.frost) else 2
            if (p.weak or p.frost) and st.horn_on and 9 <= p.sec <= 11: v = 2
            if p.frost and not p.hero:
                v = 2 if (p.unit and p.unit.kind in ('mule', 'narta')) else v
            p.sec = min(12, p.sec + v)
    for u in live_units(st):
        if u.kind == 'sledge' and u.sec >= 8:
            u.move(st)


def resolve(st):
    arrived = [p for p in st.persons if p.state == 'run' and p.sec >= 8 and not p.buried]
    for p in st.persons:
        if p.state == 'run' and not (p.sec >= 8 and not p.buried):
            p.state = 'slope'
    for p in arrived: p.state = 'arrived'
    und = (0 if RULES['run_only'] else st.predeparted) + sum(1 for p in st.persons if p.state in ('cutoff', 'slope', 'taken'))
    heroes_in = any(p.hero for p in arrived)
    if not heroes_in or und >= 3: ending = 'Склон взял своё'
    elif und == 0: ending = 'Вся упряжь'
    else: ending = 'Через перевал'
    sledges = sum(1 for u in st.units if u.kind == 'sledge' and u.alive and u.sec >= 8)
    boxes = 0
    for u in st.units:
        if u.alive and u.sec >= 8 and u.boxes:
            boxes += u.boxes
    return dict(ending=ending, undelivered=und, arrived=len(arrived), sledges=sledges, cargo=boxes,
                fire_used=st.fire_used, sacks_used=st.sacks_used, slide_turn=st.slide_turn,
                noise_slide=st.noise_slide, bites=st.bites, mules_bitten=st.mules_bitten,
                otrog=st.otrog_used, passed=st.passed,
                cut=sum(1 for p in st.persons if p.state == 'cutoff'),
                slope=sum(1 for p in st.persons if p.state == 'slope'),
                taken=sum(1 for p in st.persons if p.state == 'taken'),
                decisions=list(st.decisions), live=list(st.live), turns=st.t)


def run(start, plan, rd, seed, keep_log=False):
    rng = random.Random(seed)
    st = make_state(start, plan, rd, rng)
    for t in range(1, 11):
        st.t = t
        if not st.slid:
            pre_slide_turn(st)
        else:
            post_slide_turn(st)
        st.live.append(any(p.state == 'run' and (p.sec < 8 or p.buried or p.job) for p in st.persons) or not st.slid)
        if st.slid:
            live = [p for p in st.persons if p.state == 'run']
            if all(p.sec >= 8 and not p.buried for p in live) and not any(p.job for p in live):
                if all(p.sec >= 12 for p in live) or t >= st.slide_turn:
                    break
    r = resolve(st)
    if keep_log: r['log'] = st.log
    return r


# ---------------------------------------------------------------- starting states (end of evening 7)
def table_start(kind, heroes, learned):
    if kind == 'thrifty':
        s = dict(departed=[], weak=[], frost=[], fire=7, sacks=2, mules=6, boxes=4, bales=0,
                 hero_weakness=False, white=G1, learned=True)
    elif kind == 'average':
        s = dict(departed=['Глафира'], weak=['Херет', 'Вавила'], frost=[], fire=3, sacks=0, mules=6,
                 boxes=3, bales=1, hero_weakness=False, white=G2, learned=True)
    else:
        s = dict(departed=[], weak=['Бреша', 'Тарма', 'Глафира', 'Малкен'], frost=['Вавила', 'Херет', 'Сельда'],
                 fire=0, sacks=0, mules=4, boxes=2, bales=1, hero_weakness=True, white=G2, learned=False)
    s['heroes'] = heroes
    s['learned'] = learned
    if kind == 'wasteful' and learned:
        s['fire'] = 2   # Явра's two torches come with her story (assumption)
    return s


FIGHT = {  # assumption: Площадка fight outcome model (not printed in the campaign)
    'thrifty': dict(pG1=0.70, lost=[0.6, 0.3, 0.1]),
    'average': dict(pG1=0.50, lost=[0.4, 0.4, 0.2]),
    'wasteful': dict(pG1=0.30, lost=[0.3, 0.5, 0.2]),
}


def roll_fight(kind, heroes, rng):
    f = FIGHT[kind]
    bonus = (0.1 if heroes >= 7 else 0.0) if RULES.get('size_bonus', True) else 0.0
    g = G1 if rng.random() < min(0.95, f['pG1'] + bonus) else G2
    lost_p = list(f['lost'])
    if heroes >= 7 and RULES.get('size_bonus', True): lost_p = [lost_p[0] + 0.1, lost_p[1] - 0.05, lost_p[2] - 0.05]
    x = rng.random(); lost = 0 if x < lost_p[0] else (1 if x < lost_p[0] + lost_p[1] else 2)
    dmg = {n: rng.randint(0, hp // 2) for (n, c, hp, a) in HEROES[:heroes]}
    return g, lost, dmg


def plan_space(start, exploit=False):
    learned = start['learned']
    opts = dict(
        pass_=[False, True] if learned else [False],
        otrog=[0, 1, 2] if (learned and start['fire'] > 0) else [0],
        sledge=[False, True],
        leave_slow=[False, True] if (start['weak'] or start['frost']) else [False],
        carry_slow=[True, False] if start['frost'] else [False],
        escort=[0, 2],
        rearguard=[False, True],
    )
    for combo in itertools.product(*opts.values()):
        d = dict(zip(opts.keys(), combo))
        d['pass'] = d.pop('pass_')
        d['decoy'] = exploit
        yield d


def choose_plan(start, rd, exploit=False, seeds=(11, 12)):
    best, bkey = None, None
    for plan in plan_space(start, exploit):
        res = [run(start, plan, rd, s) for s in seeds]
        rank = {'Вся упряжь': 0, 'Через перевал': 1, 'Склон взял своё': 2}
        key = (statistics.mean(rank[r['ending']] for r in res),
               statistics.mean(r['undelivered'] for r in res),
               -statistics.mean(r['cargo'] for r in res),
               -statistics.mean(r['sledges'] for r in res),
               statistics.mean(r['fire_used'] for r in res))
        if bkey is None or key < bkey:
            best, bkey = plan, key
    return best


def cell(kind, heroes, learned, n, rd, exploit=False, fixed=None, seed0=0):
    rng = random.Random(zlib.crc32(repr((kind, heroes, learned, exploit, fixed, sorted(rd.items()))).encode()))
    cache = {}
    out = []
    for i in range(n):
        start = table_start(kind, heroes, learned)
        if fixed:
            g, lost, dmg = fixed[0], fixed[1], {}
        else:
            g, lost, dmg = roll_fight(kind, heroes, rng)
        start['white'] = g
        start['mules'] = max(0, start['mules'] - lost)
        start['hero_dmg'] = dmg
        key = (g, lost)
        if key not in cache:
            ps = dict(start); ps['hero_dmg'] = {}
            cache[key] = choose_plan(ps, rd, exploit)
        plan = cache[key]
        r = run(start, plan, rd, seed0 + i)
        r['plan'] = plan; r['white'] = WNAME[g]; r['mules_lost_fight'] = lost
        out.append(r)
    return out


def pct(xs, q):
    xs = sorted(xs)
    if not xs: return 0
    k = (len(xs) - 1) * q
    f = int(k); c = min(f + 1, len(xs) - 1)
    return xs[f] + (xs[c] - xs[f]) * (k - f)


def summarize(rs):
    n = len(rs)
    end = {e: round(100 * sum(1 for r in rs if r['ending'] == e) / n, 1)
           for e in ('Вся упряжь', 'Через перевал', 'Склон взял своё')}
    arr = [r['arrived'] for r in rs]
    dec = [d for r in rs for d in r['decisions']]
    return dict(n=n, endings=end, arrived_mean=round(statistics.mean(arr), 2),
                arrived_p10=pct(arr, 0.1), arrived_p90=pct(arr, 0.9),
                undelivered_mean=round(statistics.mean(r['undelivered'] for r in rs), 2),
                sledges_mean=round(statistics.mean(r['sledges'] for r in rs), 2),
                cargo_mean=round(statistics.mean(r['cargo'] for r in rs), 2),
                fire_used=round(statistics.mean(r['fire_used'] for r in rs), 2),
                noise_slide=round(100 * sum(r['noise_slide'] for r in rs) / n, 1),
                slide_turn=round(statistics.mean(r['slide_turn'] or 0 for r in rs), 2),
                passed=round(100 * sum(r['passed'] for r in rs) / n, 1),
                otrog=round(statistics.mean(r['otrog'] for r in rs), 2),
                mules_bitten=round(statistics.mean(r['mules_bitten'] for r in rs), 2),
                decisions_per_turn=round(statistics.mean(dec), 2) if dec else 0,
                zero_decision_turns=round(100 * sum(1 for d in dec if d == 0) / max(1, len(dec)), 1),
                G1=round(100 * sum(1 for r in rs if r['white'] == 'Г1') / n, 1),
                plans=sorted({json.dumps({k: v for k, v in r['plan'].items() if v}, ensure_ascii=False) for r in rs}))


def grid(n, rd, exploit=False, fixed=None, sizes=(6, 7, 8)):
    out = {}
    for kind in ('thrifty', 'average', 'wasteful'):
        for learned in (True, False):
            for h in sizes:
                rs = cell(kind, h, learned, n, rd, exploit, fixed)
                out[f"{kind}|{'learned' if learned else 'unlearned'}|{h}"] = summarize(rs)
    return out


def example_logs(rd):
    ex = {}
    for kind, learned, g, lost in [('thrifty', True, G1, 0), ('thrifty', False, G2, 0), ('average', True, G2, 1),
                                   ('average', False, G2, 1), ('wasteful', False, G2, 1), ('wasteful', True, G1, 0)]:
        st = table_start(kind, 6, learned); st['white'] = g; st['mules'] -= lost; st['hero_dmg'] = {}
        plan = choose_plan(st, rd)
        r = run(st, plan, rd, 1, keep_log=True)
        ex[f"{kind}|{'learned' if learned else 'unlearned'}|{WNAME[g]}|mules lost {lost}"] = dict(
            plan={k: v for k, v in plan.items() if v}, ending=r['ending'], undelivered=r['undelivered'],
            arrived=r['arrived'], log=r['log'])
    return ex


if __name__ == '__main__':
    N = int(sys.argv[1]) if len(sys.argv) > 1 else 400
    M = max(50, N // 2)
    res = dict(main=grid(N, MAIN_READINGS))
    res['fixed'] = {}
    for g in (G1, G2):
        for lost in (0, 1):
            res['fixed'][f"{WNAME[g]}|lost{lost}"] = grid(20, MAIN_READINGS, fixed=(g, lost), sizes=(6,))
    flips = dict(otrog_arrival='nothing', otrog_bitable=False, down_rides=True, slide_fire='never', hero_hit_counts=True)
    res['flips'] = {}
    for k, v in flips.items():
        rd = dict(MAIN_READINGS); rd[k] = v
        res['flips'][f"{k}={v}"] = grid(M, rd)
    res['exploit_decoy'] = grid(M, MAIN_READINGS, exploit=True)
    res['examples'] = example_logs(MAIN_READINGS)
    json.dump(res, sys.stdout, ensure_ascii=False, indent=1)
