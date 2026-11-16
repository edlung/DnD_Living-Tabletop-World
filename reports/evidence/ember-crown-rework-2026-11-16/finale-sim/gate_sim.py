"""Monte-Carlo simulator of «Битва за Северные ворота» (ember-crown, evening 8).

Built strictly from the campaign text: encounter `battle-for-the-gate` (objective, tactics,
terrain, scaling), handouts `battle-card` / `battle-dm-card`, evening 8 / 7 scenes and dmNotes,
`world.endings`. Grid: x 0..15 = columns A..P from the west, y 0..11 = rows 1..12 from the north.
Starting cells from variants/N-players.json. Run: python3 gate_sim.py [runs]
"""
import random, sys, json, statistics
from collections import Counter

W, H = 16, 12
COLS = 'ABCDEFGHIJKLMNOP'
def cell(p): return f"{COLS[p[0]]}{p[1]+1}"
ARCH = {(x, 0) for x in range(4, 12)}                       # E1-L1
REFILL_ORDER = [(7, 0), (8, 0), (6, 0), (9, 0), (5, 0), (10, 0), (4, 0), (11, 0)]  # H1 I1 G1 J1 F1 K1 E1 L1
A2 = (0, 1)
STAIRS = [(6, 11), (7, 11), (8, 11), (9, 11)]               # G12-J12
COVER = {(6, 3), (9, 3), (9, 4), (9, 5), (10, 4), (11, 4), (12, 4), (13, 4), (6, 8), (7, 8), (8, 8)}
DIFF0 = {(7, 3)}                                            # H4 embers
ASH = {(x, y) for x in range(4, 7) for y in range(5, 7)}    # E6-G7
VOLLEY = {1: {(x, y) for x in range(6, 9) for y in range(8, 10)},     # Вдова G9-I10
          2: {(x, y) for x in range(10, 13) for y in range(9, 11)},   # Ворчун K10-M11
          3: ASH}                                                     # Жаровня E6-G7
SIDE = {'A7': [(0, 6), (0, 7)], 'P7': [(15, 6), (15, 7)]}
STAIRS_ZONE = {(x, y) for x in range(6, 10) for y in (10, 11)}   # G11-J12
FLANKS = {(5, 10), (5, 11), (10, 10), (10, 11)}                   # F11 F12 K11 K12
SOUTH_FREE = [(x, 11) for x in list(range(0, 6)) + list(range(10, 16))]
NB = [(-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1)]
HERO_CELLS = {6: [(7, 11), (8, 11), (6, 11), (9, 11), (5, 11), (10, 11)],
              7: [(7, 11), (8, 11), (6, 11), (9, 11), (5, 11), (10, 11), (4, 11)],
              8: [(7, 11), (8, 11), (6, 11), (9, 11), (5, 11), (10, 11), (4, 11), (11, 11)]}
FOE_CELLS = [(7, 0), (8, 0), (6, 0), (9, 0), (5, 0), (10, 0), (4, 0)]   # foe-1..7, boss on L1
# cast.json order: Тарна fighter, Оллир rogue, Радея cleric, Демек wizard, Вонда fighter,
# Суня rogue, Нель cleric, Ирса wizard. Dwarves: Тарна, Суня.
HEROES = [('Тарна', 'fighter', True), ('Оллир', 'rogue', False), ('Радея', 'cleric', False),
          ('Демек', 'wizard', False), ('Вонда', 'fighter', False), ('Суня', 'rogue', True),
          ('Нель', 'cleric', False), ('Ирса', 'wizard', False)]
HSTAT = {'fighter': dict(hp=31, ac=11, dex=1, dsave=1, ath=5, init=1),
         'rogue': dict(hp=24, ac=13, dex=3, dsave=5, ath=0, init=3),
         'cleric': dict(hp=24, ac=11, dex=1, dsave=1, ath=1, init=1),
         'wizard': dict(hp=20, ac=12, dex=2, dsave=2, ath=-1, init=2)}
FSTAT = {'stormer': dict(hp=9, ac=13, dsave=0, init=0, atk=3, dmg=(1, 6, 1)),
         'guard': dict(hp=11, ac=16, dsave=1, init=1, atk=3, dmg=(1, 6, 1)),
         'sair': dict(hp=67, ac=13, dsave=1, init=1, atk=5, dmg=(1, 12, 3))}

def d(n, s): return sum(random.randint(1, s) for _ in range(n))
def cheb(a, b): return max(abs(a[0]-b[0]), abs(a[1]-b[1]))
def inb(p): return 0 <= p[0] < W and 0 <= p[1] < H

class Fig:
    def __init__(s, name, kind, side, pos, **kw):
        s.name, s.kind, s.side, s.pos = name, kind, side, pos
        s.__dict__.update(kw)
        s.maxhp = s.hp
        s.on = True          # on the field (foes: standing; heroes: always on unless left)
        s.dropped = False    # hero ever at 0 HP
    @property
    def up(s): return s.on and s.hp > 0

class Battle:
    def __init__(s, n, dawn, rd, pol, log=False):
        s.n, s.dawn, s.rd, s.pol, s.logon = n, dawn, rd, pol, log
        s.round = 0; s.result = None; s.why = None
        s.portcullis = False; s.port_pending = False
        s.signal_round = None; s.nb_arrived = False; s.nb_in = False
        s.banner_torn = False; s.sair_gone = None
        s.diff = set(DIFF0)
        s.decisions = Counter(); s.dm_steps = Counter()
        s.side_debt = 0
        s.heroes = []
        speed_dw = 5 if rd['dwarf5'] else 6
        for i in range(n):
            nm, cl, dw = HEROES[i]
            st = HSTAT[cl]
            h = Fig(nm, cl, 'hero', HERO_CELLS[n][i], hp=st['hp'], ac=st['ac'], dsave=st['dsave'],
                    ath=st['ath'], init=st['init'] + random.randint(1, 20), speed=speed_dw if dw else 6)
            h.sw = 2 if cl == 'fighter' else 0
            h.hw = 4 if cl == 'cleric' else 0
            h.misty = 2 if cl == 'wizard' else 0
            h.role = 'free'
            s.heroes.append(h)
        ns = 4 if n == 8 else 5
        s.foes = []
        for i, p in enumerate(FOE_CELLS):
            k = 'stormer' if i < ns else 'guard'
            st = FSTAT[k]
            s.foes.append(Fig(f"{k}{i+1}", k, 'foe', p, hp=st['hp'], ac=st['ac'], dsave=st['dsave'],
                              atk=st['atk'], dmg=st['dmg'], init=st['init'] + random.randint(1, 20), speed=6))
        st = FSTAT['sair']
        s.sair = Fig('Сайр', 'sair', 'foe', (11, 0), hp=st['hp'], ac=st['ac'], dsave=st['dsave'],
                     atk=st['atk'], dmg=st['dmg'], init=st['init'] + random.randint(1, 20), speed=6)
        s.sair.withdrawing = False
        s.sair.ac = rd.get('sair_ac', s.sair.ac); s.sair.natk = rd.get('sair_attacks', 1)
        s.F = 7
        if dawn['lessara']:   # remove the guard farthest from the centre (E1 guard)
            g = max([f for f in s.foes if f.kind == 'guard'], key=lambda f: abs(f.pos[0] - 7.5))
            g.on = False; g.hp = 0; g.lost = True   # not a fallen figure: gone for good
            s.F = 6
        for f in s.foes: f.lost = getattr(f, 'lost', False)
        cv = dawn['gates']
        if cv >= 4: s.target, s.refill_rounds = s.F - 1, (3, 5)
        elif cv >= 2: s.target, s.refill_rounds = s.F, (3, 5)
        else: s.target, s.refill_rounds = s.F, (3, 5, 7)
        s.sair_moves_r1 = cv == 0
        if rd.get('lever_j'): s.sair_moves_r1 = False   # Ворота 0: Сайр no longer moves from round 1
        if rd.get('lever_d') and cv <= 1:          # Сайр starts on row 2; refill every round from round 2
            s.sair.pos = (11, 1); s.refill_rounds = tuple(range(2, 9))
        if rd.get('lever_e'):                       # refill every second round from round 3, every gate value
            s.refill_rounds = tuple(sorted(set(s.refill_rounds) | {3, 5, 7}))
        if rd.get('lever_k'):                       # waves by gate value: 4-5 one wave, 2-3 three, 0-1 every round
            s.refill_rounds = (3,) if cv >= 4 else ((3, 5, 7) if cv >= 2 else tuple(range(2, 9)))
            s.target = s.F
        if rd.get('lever_p') and n >= 7:            # 7-8 players: refill every round from round 3
            s.refill_rounds = tuple(sorted(set(s.refill_rounds) | set(range(3, 9))))
        s.n_refilled = 0; s.n_side = 0; s.n_volley_hits = 0; s.n_nb_removed = 0
        s.no_move_r1 = cv == 5
        s.assign_roles()

    # ---------------- helpers
    def log(s, *a):
        if s.logon: print(f"R{s.round}:", *a)
    def figs(s): return [f for f in s.heroes + s.foes + [s.sair] if f.on]
    def occ(s):
        return {f.pos: f for f in s.figs()}
    def blocked_for(s, f):
        """cells f cannot pass through (hostile figures, closed arch)."""
        b = {g.pos for g in s.figs() if g.side != f.side}
        if s.portcullis or s.nb_in: b |= ARCH
        if f.side == 'hero': b |= ARCH   # heroes never go into the arch (they leave only south)
        return b
    def dist_from(s, f, src, maxc=99, multi=False):
        """Dijkstra over passable cells (allies passable); difficult cost 2."""
        bl = s.blocked_for(f)
        srcs = list(src) if multi else [src]
        D = {p: 0 for p in srcs}; fr = [(0, p) for p in srcs]
        import heapq
        while fr:
            c, p = heapq.heappop(fr)
            if c > D.get(p, 99) or c >= maxc: continue
            for dx, dy in NB:
                q = (p[0]+dx, p[1]+dy)
                if not inb(q) or q in bl: continue
                nc = c + (2 if q in s.diff else 1)
                if nc < D.get(q, 99): D[q] = nc; heapq.heappush(fr, (nc, q))
        return D
    def free_cells(s, f, budget):
        oc = s.occ()
        D = s.dist_from(f, f.pos, budget + 1)
        return {p: c for p, c in D.items() if c <= budget and (p not in oc or oc[p] is f)}
    def move_toward(s, f, goals, budget, avoid=set(), prefer=None):
        """move to reachable free cell minimising distance to nearest goal cell."""
        if not goals: return 0
        R = s.free_cells(f, budget)
        G = s.dist_from(f, goals, multi=True)   # distance field from all goals at once
        best = min(R, key=lambda p: (G.get(p, 99) + (5 if p in avoid else 0), R[p],
                                      prefer(p) if prefer else 0))
        used = R[best]; f.pos = best
        return used
    def adj_hostiles(s, f, standing=True):
        return [g for g in s.figs() if g.side != f.side and cheb(g.pos, f.pos) == 1 and (g.hp > 0 or not standing)]
    def attack(s, a, t, bonus, dmg, ranged=False, adv=0, extra=None):
        ac = t.ac + (2 if ranged and t.pos in COVER else 0)
        rolls = [random.randint(1, 20) for _ in range(2 if adv else 1)]
        r = max(rolls) if adv > 0 else (min(rolls) if adv < 0 else rolls[0])
        if r == 1 or (r != 20 and r + bonus < ac): return 0
        n, sd, b = dmg
        dm = d(n * (2 if r == 20 else 1), sd) + b
        if extra: dm += d(extra[0] * (2 if r == 20 else 1), extra[1])
        s.damage(t, dm)
        return dm
    def damage(s, t, dm):
        t.hp -= dm
        if t.hp <= 0:
            t.hp = 0
            if t.side == 'hero':
                t.dropped = True; s.log(t.name, 'падает на', cell(t.pos))
            elif t is s.sair:
                s.sair_gone = 'упал'; t.on = False; s.log('Сайр упал')
            else:
                t.on = False; s.log(t.name, 'упал')
        if t is s.sair and s.rd['threshold_any_time'] and t.on: s.check_threshold()
    def fallen_pool(s):
        return [f for f in s.foes if not f.on and not f.lost]
    def standing_foes(s): return [f for f in s.foes if f.on]

    # ---------------- roles (table policy)
    def assign_roles(s):
        hs = s.heroes
        p = s.pol
        for h in hs:
            if h.pos in STAIRS: h.role = 'stairs'
        if p['tactic'] == 'rush':
            for h in hs: h.role = 'rush'
            return
        # runner to A2: Суня (rogue) if present-free, else Вонда
        if p['portcullis']:
            run = next((h for h in hs if h.name == 'Суня'), None)
            run.role = 'runner'
            if s.dawn['chain'] == 'broken':
                second = next(h for h in hs if h.name == 'Вонда'); second.role = 'runner'

    # ---------------- round structure
    def run(s):
        while s.result is None:
            s.round += 1
            s.start_of_round()
            order = sorted(s.figs(), key=lambda f: -f.init)
            for f in order:
                if s.result: break
                if not f.on: continue
                if f.side == 'hero':
                    if f.hp > 0: s.hero_turn(f)
                elif f is s.sair: s.sair_turn()
                else: s.foe_turn(f)
            s.end_of_round()
        return s

    def start_of_round(s):
        r = s.round
        if s.rd.get('sair_enter') and r == 1:
            s.sair.home = s.sair.pos; s.sair.on = False            # behind the gate leaves until his round
        if s.rd.get('sair_enter') and r == s.rd['sair_enter'] and not s.sair.on and not s.sair_gone:
            oc = s.occ()
            cells = [s.sair.home] + [c for c in REFILL_ORDER[::-1] if c != s.sair.home] + [(x, 1) for x in range(4, 12)]
            free = [c for c in cells if c not in oc and not (s.portcullis and c in ARCH)]
            if free: s.sair.pos = free[0]; s.sair.on = True
        if s.rd.get('lever_h') and s.dawn['alliance'] and not s.nb_arrived:
            if r >= 3 + (1 if s.dawn['alliance'] == 'late' else 0):
                s.nb_arrived = True; s.dm_steps['соседи пришли'] += 1
                if not s.portcullis: s.nb_in = True; s.log('соседи вошли в арку')
        if s.rd.get('lever_m') and s.dawn['alliance'] and not s.nb_arrived and not s.portcullis:
            late = 1 if s.dawn['alliance'] == 'late' else 0
            due = (max(3, s.signal_round + 1) + late) if s.signal_round else 99
            if not s.rd.get('nb_need_signal'): due = 3 + late
            if r >= due:
                s.nb_arrived = True; s.nb_outside_fight = True; s.dm_steps['соседи пришли'] += 1
        if not s.rd.get('lever_h') and not s.rd.get('lever_m') and s.dawn['alliance'] and not s.nb_arrived:
            arr = None
            if s.signal_round: arr = s.signal_round + 2 + (1 if s.dawn['alliance'] == 'late' else 0)
            noarr = 6 + (1 if s.rd['late_plus_unsignalled'] and s.dawn['alliance'] == 'late' else 0)
            arr = min(arr or 99, noarr)
            if r >= arr:
                s.nb_arrived = True; s.dm_steps['соседи пришли'] += 1; s.log('соседи пришли')
        if r in s.refill_rounds and not s.portcullis and (not s.nb_arrived or s.rd.get('lever_m')) and (not s.nb_in or s.rd.get('refill_after_letin')):
            s.dm_steps['доливка'] += 1
            oc = s.occ()
            for p in REFILL_ORDER:
                if len(s.standing_foes()) >= s.target: break
                pool = s.fallen_pool()
                if not pool: break
                if p in oc: continue
                f = pool[0]; f.on = True; f.hp = f.maxhp; f.pos = p; s.n_refilled += 1
            s.log('доливка до', len(s.standing_foes()))
        open_side = [k for k in ('A7', 'P7') if s.dawn[k] and not (k == 'A7' and getattr(s, 'a7_locked', False))]
        if open_side:
            if r in (2, 4): s.side_debt += 2
            if s.side_debt:
                s.dm_steps['боковые входы'] += 1
                oc = s.occ()
                for k in open_side:
                    for p in SIDE[k]:
                        pool = s.fallen_pool()
                        if not s.side_debt or not pool: break
                        if p in oc: continue
                        f = pool[0]; f.on = True; f.hp = f.maxhp; f.pos = p; s.side_debt -= 1; s.n_side += 1

    def end_of_round(s):
        r = s.round
        # 1 volley
        zone = VOLLEY.get(r)
        if s.rd.get('lever_g') and r in (2, 4):
            zone = None if s.dawn['zharovnya_silent'] else STAIRS_ZONE
        if zone and not (r == 3 and s.dawn['zharovnya_silent']):
            s.dm_steps['залп'] += 1
            for f in list(s.figs()):
                if f.hp > 0 and f.pos in zone:
                    s.n_volley_hits += 1
                    dm = d(2, 6)
                    if random.randint(1, 20) + f.dsave >= 12: dm //= 2
                    s.dm_steps['спасбросок'] += 1
                    s.damage(f, dm)
            if r == 3: s.diff |= ASH
        # 2 neighbours remove one
        if s.nb_arrived and (not s.nb_in or s.rd.get('lever_h')) and (not s.portcullis or s.rd['nb_remove_through_bars']):
            c = [f for f in s.standing_foes() if f.pos[1] <= 2 or s.rd.get('lever_h') or s.rd.get('lever_m')]
            if c:
                f = min(c, key=lambda f: min(cheb(f.pos, a) for a in ARCH))
                f.on = False; f.hp = 0
                if not s.rd['nb_removed_are_fallen']: f.lost = True
                s.dm_steps['соседи снимают'] += 1; s.n_nb_removed += 1; s.log('ленты утащили', f.name)
        # 3 let neighbours in
        if s.nb_arrived and not s.nb_in and not s.portcullis and s.pol['let_in']:
            if not any(f.pos in ARCH for f in s.figs() if f.side == 'foe'):
                s.nb_in = True; s.dm_steps['впустить'] += 1; s.log('В ворота!')
        # 4 portcullis
        if s.port_pending and not s.portcullis:
            s.portcullis = True; s.dm_steps['решётка'] += 1
            if s.sair.on and s.sair.pos in ARCH:
                oc = s.occ()
                opts = [q for q in [(s.sair.pos[0]+dx, 1) for dx in (0, -1, 1, -2, 2)] if inb(q) and q not in oc]
                if opts: s.sair.pos = opts[0]
                else: s.dead_states.append('Сайр в арке, ряд 2 занят')  # noqa
            for f in s.standing_foes():
                if f.pos in ARCH: f.on = False; f.hp = 0; s.log('отрезан', f.name)
            s.log('решётка упала')
        # 5 stretcher-bearers
        if s.dawn['market'] >= 1:
            down = [h for h in s.heroes if h.on and h.hp == 0]
            if down:
                h = min(down, key=lambda h: min(cheb(h.pos, a) for a in ARCH))
                oc = s.occ()
                spots = [p for p in SOUTH_FREE if p not in oc]
                if spots:
                    old = h.pos
                    h.pos = min(spots, key=lambda p: abs(p[0] - 7.5)); h.hp = 1
                    s.dm_steps['носильщики'] += 1
                    if old in STAIRS: s.stair_emptied += 1
        # 6 end?
        s.dm_steps['конец боя?'] += 1
        if s.banner_up:
            s.result, s.why = 'defeat', 'знамя встало'
        elif all(h.hp == 0 or not h.on for h in s.heroes):
            s.result, s.why = 'defeat', 'все герои выбыли'
        elif s.banner_torn:
            s.result, s.why = 'victory', 'знамя сорвано'
        elif s.sair_gone:
            s.result, s.why = 'victory', 'Сайр ' + s.sair_gone
        elif r >= 8:
            s.result, s.why = 'victory', 'раунд 8'

    # ---------------- Sair
    def sair_turn(s):
        S = s.sair; r = s.round
        s.decisions['DM: Сайр'] += 1
        if S.withdrawing:
            s.sair_withdraw(); return
        if r <= 2 and not s.sair_moves_r1:
            t = [h for h in s.adj_hostiles(S)]
            if t: s.sair_hit(min(t, key=lambda h: h.hp))
            s.check_threshold(); return
        oc = s.occ()
        free_st = [p for p in STAIRS if p not in oc]
        if s.rd.get('onto_prone'):
            pr = [p for p in STAIRS if p in oc and oc[p].side == 'hero' and oc[p].hp == 0]
            for p in sorted(pr, key=lambda p: cheb(p, S.pos)):
                spots = [(p[0]+dx, p[1]+dy) for dx, dy in NB]
                spots = [q for q in spots if inb(q) and q not in oc and q not in STAIRS]
                if not spots: continue
                hero = oc[p]; hero.on = False                  # let Сайр path into the cell
                R = s.free_cells(S, S.speed); hero.on = True
                if p in R:
                    hero.pos = spots[0]; S.pos = p; s.banner_up = True
                    s.log('Сайр сдвигает лежащего и поднимает знамя'); return
        if s.rd.get('prone_no_block') and not s.rd.get('onto_prone'):
            pr = [p for p in STAIRS if p in oc and oc[p].side == 'hero' and oc[p].hp == 0]
            if pr:
                R = s.free_cells(S, S.speed)
                adj = [q for q in R if any(cheb(q, p) <= 1 for p in pr)]
                if adj:
                    S.pos = min(adj, key=lambda q: R[q]); s.banner_up = True
                    s.log('Сайр поднимает знамя над лежащим'); return
        if free_st:
            R = s.free_cells(S, S.speed)
            reach = [p for p in free_st if p in R]
            if reach:
                S.pos = reach[0]; s.banner_up = True; s.log('Сайр поднимает знамя на', cell(S.pos)); return
            s.move_toward(S, free_st, S.speed)
            t = s.adj_hostiles(S)
            if t: s.sair_hit(min(t, key=lambda h: h.hp))
        else:
            # all four occupied: a prone hero on a stair adjacent -> shift him (action) to free a stair
            prone = [h for h in s.heroes if h.on and h.hp == 0 and h.pos in STAIRS]
            if prone:
                tgt = min(prone, key=lambda h: cheb(h.pos, S.pos))
                nbrs = [(tgt.pos[0]+dx, tgt.pos[1]+dy) for dx, dy in NB]
                s.move_toward(S, nbrs, S.speed)
                if cheb(S.pos, tgt.pos) == 1:
                    oc = s.occ()
                    spots = [q for q in nbrs if inb(q) and q not in oc and q not in STAIRS]
                    if spots:
                        tgt.pos = spots[0]; s.log('Сайр перекладывает', tgt.name); s.check_threshold(); return
            onst = [h for h in s.heroes if h.up and h.pos in STAIRS]
            if onst:
                tgt = min(onst, key=lambda h: h.hp)
                nbrs = [(tgt.pos[0]+dx, tgt.pos[1]+dy) for dx, dy in NB]
                s.move_toward(S, nbrs, S.speed)
                t = s.adj_hostiles(S)
                if t:
                    tt = tgt if tgt in t else min(t, key=lambda h: h.hp)
                    s.sair_hit(tt)
        s.check_threshold()
    def sair_hit(s, t):
        for _ in range(s.sair.natk):
            if t.hp > 0: s.attack(s.sair, t, s.sair.atk, s.sair.dmg)
    def check_threshold(s):
        S = s.sair
        if s.round >= s.rd.get('thr_round', 3) and S.on and S.hp <= s.rd.get('thr', 33) and not S.withdrawing:
            S.withdrawing = True; s.log('Сайр на пороге (', S.hp, ')')
    def sair_withdraw(s):
        S = s.sair
        arch_free = not s.portcullis and not s.nb_in
        if arch_free:
            goals = [a for a in ARCH]
            s.move_toward(S, goals, 12)
            if S.pos in ARCH:
                S.on = False; s.sair_gone = 'отошёл'; s.log('Сайр ушёл за арку')
        else:
            goals = [(x, y) for x in range(W) for y in (0, 1) if (x, y) not in ARCH]
            s.move_toward(S, goals, 12)
            if S.pos[1] <= 1:
                S.on = False; s.sair_gone = 'сдался'; s.log('Сайр бросил знамя и сдался')

    # ---------------- other foes
    def foe_turn(s, f):
        r = s.round
        s.decisions['DM: противник'] += 1
        if r == 1 and s.no_move_r1 and f.pos in ARCH:
            t = [h for h in s.heroes if h.up and cheb(h.pos, f.pos) <= 12]
            if t:
                tt = min(t, key=lambda h: cheb(h.pos, f.pos))
                s.attack(f, tt, f.atk, f.dmg, ranged=True, adv=-1 if cheb(tt.pos, f.pos) > 4 else 0)
            return
        if f.kind == 'guard' and s.rd.get('lever_f'):
            tg = [h for h in s.heroes if h.up and h.pos in STAIRS]
            if tg:
                if not any(h in tg for h in s.adj_hostiles(f)):
                    goals = [q for h in tg for q in [(h.pos[0]+dx, h.pos[1]+dy) for dx, dy in NB] if inb(q)]
                    s.move_toward(f, goals, f.speed, prefer=lambda p: 0 if p in FLANKS else 1)
                t = [h for h in s.adj_hostiles(f) if h in tg] or s.adj_hostiles(f)
                if t: s.attack(f, min(t, key=lambda h: h.hp), f.atk, f.dmg)
                return
        guard_mode = f.kind == 'guard' and (r >= 3 or s.rd['guards_hold_sair_r12']) and s.sair.on
        if guard_mode:
            S = s.sair
            nbrs = [(S.pos[0]+dx, S.pos[1]+dy) for dx, dy in NB]
            # prefer a cell next to Sair that is also next to a hero hindering him
            hind = [h for h in s.heroes if h.up and cheb(h.pos, S.pos) <= 2]
            def pref(p): return min([cheb(p, h.pos) for h in hind] or [9])
            if cheb(f.pos, S.pos) != 1 or not s.adj_hostiles(f):
                s.move_toward(f, nbrs, f.speed, prefer=pref)
            t = s.adj_hostiles(f)
            if t:
                t2 = [h for h in t if cheb(h.pos, S.pos) <= 1] or t
                s.attack(f, min(t2, key=lambda h: h.hp), f.atk, f.dmg)
            return
        # stormers (and guards before round 3): press heroes on the stairs and at A2
        tg = [h for h in s.heroes if h.up and (h.pos in STAIRS or cheb(h.pos, A2) <= 1)]
        if not tg: tg = [h for h in s.heroes if h.up]
        if not tg: return
        t = s.adj_hostiles(f)
        if not t:
            goals = []
            for h in tg: goals += [(h.pos[0]+dx, h.pos[1]+dy) for dx, dy in NB]
            goals = [g for g in goals if inb(g)]
            s.move_toward(f, goals, f.speed)
            t = s.adj_hostiles(f)
        if t:
            s.attack(f, min(t, key=lambda h: h.hp), f.atk, f.dmg)
        else:
            rt = [h for h in s.heroes if h.up and cheb(h.pos, f.pos) <= 12]
            if rt:
                tt = min(rt, key=lambda h: cheb(h.pos, f.pos))
                s.attack(f, tt, f.atk, f.dmg, ranged=True, adv=-1 if cheb(tt.pos, f.pos) > 4 else 0)

    # ---------------- heroes
    def tear_allowed(s):
        S = s.sair
        if s.rd.get('tear_once') and getattr(s, 'tear_round', 0) == s.round: return False
        hp_ok = S.hp <= s.rd.get('tear_thr', s.rd.get('thr', 33)) and s.round >= s.rd.get('tear_hp_round', 1)
        return S.on and not s.banner_torn and (S.pos[1] >= s.rd.get('tear_row', 6) or hp_ok) and s.pol['tear']
    def hero_attack(s, h, t):
        allies_adj = any(o is not h and o.up and cheb(o.pos, t.pos) == 1 for o in s.heroes)
        if h.kind == 'fighter':
            s.attack(h, t, 5, (1, 8, 3))
        elif h.kind == 'rogue':
            if cheb(h.pos, t.pos) == 1:
                s.attack(h, t, 5, (1, 8, 3), extra=(2, 6) if allies_adj else None)
            else:
                s.attack(h, t, 5, (1, 6, 3), ranged=True, extra=(2, 6) if allies_adj else None)
        elif h.kind == 'cleric':
            if cheb(h.pos, t.pos) == 1: s.attack(h, t, 3, (1, 6, 1))
        elif h.kind == 'wizard':
            s.attack(h, t, 5, (1, 10, 0), ranged=True, adv=-1 if cheb(h.pos, t.pos) == 1 else 0)
    def can_reach_target(s, h, t):
        return h.kind in ('rogue', 'wizard') or cheb(h.pos, t.pos) == 1
    def hero_bonus(s, h):
        if h.kind == 'cleric' and h.hw:
            down = [o for o in s.heroes if o.on and o.hp == 0 and cheb(o.pos, h.pos) <= 12]
            if down:
                o = min(down, key=lambda o: (o.pos not in STAIRS, o.hp))
                o.hp = d(2, 4) + 3; h.hw -= 1; s.decisions['бонус: Целительное слово'] += 1
                return True
        if h.kind == 'fighter' and h.sw and h.hp <= h.maxhp // 2:
            h.hp = min(h.maxhp, h.hp + d(1, 10) + 3); h.sw -= 1; s.decisions['бонус: Второе дыхание'] += 1
            return True
        if h.name == 'Оллир' and s.dawn['alliance'] and s.signal_round is None and s.round >= 2 and s.pol['signal']:
            s.signal_round = s.round; s.decisions['бонус: три рога'] += 1; s.log('три рога')
            return True
        return False
    def avoid_zone(s):
        r = s.round
        return VOLLEY.get(r, set()) if not (r == 3 and s.dawn['zharovnya_silent']) else set()
    def try_tear(s, h):
        S = s.sair
        if not s.tear_allowed() or cheb(h.pos, S.pos) != 1: return False
        s.decisions['сорвать знамя'] += 1; s.tear_round = s.round
        a, b = random.randint(1, 20) + h.ath, random.randint(1, 20) + 3
        if a > b or (a == b and s.rd['tie_to_hero']):
            s.banner_torn = True; S.withdrawing = True; s.log(h.name, 'срывает знамя'); return True
        return False
    def hero_turn(s, h):
        s.decisions['ход героя'] += 1
        bonus_used = s.hero_bonus(h) if h.hp > 0 else False
        if h.hp == 0: return
        S = s.sair
        zone = s.avoid_zone()
        budget = h.speed
        role = h.role
        # stairs holders: refill an empty stair if a holder was carried away
        oc = s.occ()
        empty_st = [p for p in STAIRS if p not in oc]
        if role == 'free' and empty_st and s.pol['tactic'] != 'rush' and s.round >= 3:
            R = s.free_cells(h, budget * 2)
            reach = [p for p in empty_st if p in R]
            if reach:
                h.pos = reach[0]; h.role = 'stairs'; s.decisions['занять ступень'] += 1
                if R[h.pos] > budget: return   # dashed: no action
                role = 'stairs'
        if role == 'runner':
            if s.portcullis or s.port_pending:
                h.role = 'free'; role = 'free'
            else:
                ok = (lambda: h.pos == A2) if s.dawn['chain'] == 'intact' else (lambda: cheb(h.pos, A2) <= 1)
                if not ok():
                    goals = [A2] if s.dawn['chain'] == 'intact' else [(0, 0), (1, 0), (1, 1), (0, 2), (1, 2), A2]
                    s.move_toward(h, goals, budget)
                    if not ok() and h.kind == 'rogue' and not bonus_used:
                        s.move_toward(h, goals, budget); bonus_used = True   # Cunning Action dash
                    elif not ok():
                        s.move_toward(h, goals, budget)   # Dash with action
                        return
                if cheb(h.pos, A2) <= (0 if s.dawn['chain'] == 'intact' else 1) and s.round >= s.rd.get('port_round', 2):
                    s.decisions['решётка'] += 1
                    if s.dawn['chain'] == 'intact':
                        s.port_pending = True
                    else:
                        s.port_votes = getattr(s, 'port_votes', {})
                        s.port_votes.setdefault(s.round, set()).add(h.name)
                        if len(s.port_votes[s.round]) >= 2: s.port_pending = True
                    return
                t = s.adj_hostiles(h)
                if t: s.hero_attack(h, min(t, key=lambda x: x.hp))
                elif h.kind == 'rogue':
                    rt = [f for f in s.figs() if f.side == 'foe']
                    if rt: s.hero_attack(h, S if S.on and S in rt else min(rt, key=lambda f: cheb(f.pos, h.pos)))
                return
        if role == 'stairs':
            if s.try_tear(h): return
            t = s.adj_hostiles(h)
            if S.on and S in t: s.hero_attack(h, S); return
            if h.kind in ('rogue', 'wizard') and S.on:
                s.hero_attack(h, S); return
            if t: s.hero_attack(h, min(t, key=lambda x: x.hp)); return
            return
        # free / rush heroes
        if S.on:
            nbrs = [(S.pos[0]+dx, S.pos[1]+dy) for dx, dy in NB]
            nbrs = [p for p in nbrs if inb(p)]
            want_sair = role == 'rush' or s.tear_allowed() or s.round >= 3
            if want_sair:
                if cheb(h.pos, S.pos) != 1:
                    R = s.free_cells(h, budget)
                    reach = [p for p in nbrs if p in R]
                    if reach:
                        h.pos = min(reach, key=lambda p: (p in zone, R[p]))
                    else:
                        # Misty Step (bonus) inside the 12 limit, else Cunning dash, else plain approach
                        if h.misty and not bonus_used:
                            R2 = s.free_cells(h, budget)
                            for p0 in sorted(R2, key=lambda p: min(cheb(p, q) for q in nbrs)):
                                cand = [q for q in nbrs if cheb(p0, q) <= 6 and q not in s.occ() and q not in s.blocked_for(h)]
                                if cand and R2[p0] + 6 <= 12:
                                    h.pos = cand[0]; h.misty -= 1; bonus_used = True
                                    s.decisions['бонус: Туманный шаг'] += 1; break
                        if cheb(h.pos, S.pos) != 1 and h.kind == 'rogue' and not bonus_used:
                            R2 = s.free_cells(h, budget * 2)
                            reach = [p for p in nbrs if p in R2]
                            if reach: h.pos = reach[0]; bonus_used = True
                        if cheb(h.pos, S.pos) != 1:
                            s.move_toward(h, nbrs, budget, avoid=zone)
                            if cheb(h.pos, S.pos) != 1 and role == 'rush' and h.kind in ('fighter', 'cleric'):
                                s.move_toward(h, nbrs, budget, avoid=zone)   # Dash with action
                                return
                if cheb(h.pos, S.pos) == 1 and s.try_tear(h): return
                if s.can_reach_target(h, S): s.hero_attack(h, S); return
        # otherwise engage the nearest foe (protect the stairs)
        foes = [f for f in s.figs() if f.side == 'foe']
        if not foes: return
        t = s.adj_hostiles(h)
        if not t:
            tgt = min(foes, key=lambda f: (cheb(f.pos, (7.5, 11)), f.hp))
            if h.kind in ('rogue', 'wizard'):
                s.hero_attack(h, tgt if tgt.on else foes[0]); return
            nb = [(tgt.pos[0]+dx, tgt.pos[1]+dy) for dx, dy in NB]
            s.move_toward(h, [p for p in nb if inb(p)], budget, avoid=zone)
            t = s.adj_hostiles(h)
        if t: s.hero_attack(h, min(t, key=lambda x: (x is not S, x.hp)))


def outcome(b, dawn):
    if b.result == 'victory':
        if dawn['alliance'] and b.nb_arrived and not b.nb_in: return 'Венец стоит / цена: Соседи'
        if dawn['unevacuated_breach']: return 'Венец стоит / цена: Отданный квартал'
        return 'Венец стоит / цена: Рабочие Журны'
    return 'Уход по Камышовой' if dawn['reeds'] >= 1 else 'Пощада'

# ---------------- dawn states («как текст выводит»: night-order, wall-scheme, evenings 1-7)
TABLES = {
    'понемногу': dict(gates=3, ash=3, market=2, reeds=4, forge=4, A7=False, P7=False, alliance='normal',
                      lessara=True, chain='intact', zharovnya_silent=True, unevacuated_breach=False),
    'ворота': dict(gates=4, ash=0, market=0, reeds=4, forge=4, A7=False, P7=True, alliance='normal',
                   lessara=True, chain='intact', zharovnya_silent=False, unevacuated_breach=False),
    'бросил низ': dict(gates=4, ash=0, market=0, reeds=0, forge=5, A7=False, P7=True, alliance=None,
                       lessara=False, chain='intact', zharovnya_silent=False, unevacuated_breach=True),
}
BASE_RD = dict(dwarf5=False, guards_hold_sair_r12=False, nb_remove_through_bars=False,
               nb_removed_are_fallen=True, tie_to_hero=False, late_plus_unsignalled=False,
               threshold_any_time=False)

def policy(dawn, tactic='stairs', tear=True, portcullis=None):
    allied = bool(dawn['alliance'])
    return dict(tactic=tactic, tear=tear, signal=True, let_in=True,
                portcullis=(not allied) if portcullis is None else portcullis)

def run_cell(n, dawn, rd, pol, runs, seed):
    random.seed(seed)
    res = Counter(); rounds = []; drop = []; whys = Counter(); stair = 0; dec = []; dms = []; ft = []; act = Counter()
    for _ in range(runs):
        b = Battle(n, dawn, rd, pol)
        b.banner_up = False; b.stair_emptied = 0; b.dead_states = []
        b.run()
        res[outcome(b, dawn)] += 1; whys[b.why] += 1
        rounds.append(b.round); drop.append(sum(h.dropped for h in b.heroes))
        stair += b.stair_emptied
        dec.append(sum(v for k, v in b.decisions.items() if not k.startswith('DM')) / b.round)
        dms.append(sum(b.dm_steps.values()) / b.round)
        ft.append((b.decisions['DM: противник'] + b.decisions['DM: Сайр']) / b.round)
        act['refill'] += b.n_refilled > 0; act['side'] += b.n_side > 0
        act['volley'] += b.n_volley_hits > 0; act['nb'] += b.n_nb_removed > 0
    rounds.sort()
    q = lambda p: rounds[min(len(rounds) - 1, int(p * len(rounds)))]
    return dict(n=n, runs=runs, outcomes=dict(res), why=dict(whys), mean_rounds=round(statistics.mean(rounds), 2),
                p10=q(0.1), p90=q(0.9), any_drop=round(sum(1 for x in drop if x) / runs, 3),
                mean_drops=round(statistics.mean(drop), 2), stair_emptied=round(stair / runs, 3),
                hero_decisions_per_round=round(statistics.mean(dec), 1),
                dm_steps_per_round=round(statistics.mean(dms), 1),
                foe_turns_per_round=round(statistics.mean(ft), 1),
                happened={k: round(v / runs, 2) for k, v in act.items()})

if __name__ == '__main__':
    runs = int(sys.argv[1]) if len(sys.argv) > 1 else 400
    out = []
    def go(label, n, tname, dawn, rd, pol):
        r = run_cell(n, dawn, rd, pol, runs, hash((label, n, tname)) & 0xffff)
        r.update(label=label, table=tname); out.append(r)
        print(json.dumps(r, ensure_ascii=False))
    for tname, dawn in TABLES.items():
        for n in (6, 7, 8):
            go('A базовая политика', n, tname, dawn, BASE_RD, policy(dawn))
    # readings and exploits (all sizes for the decisive ones)
    for tname, dawn in TABLES.items():
        for n in (6, 8):
            go('B без срыва знамени', n, tname, dawn, BASE_RD, policy(dawn, tear=False))
            go('C рывок на Сайра', n, tname, dawn, BASE_RD, policy(dawn, tactic='rush'))
            go('D решётка всегда', n, tname, dawn, BASE_RD, policy(dawn, portcullis=True))
            go('E без решётки', n, tname, dawn, BASE_RD, policy(dawn, portcullis=False))
            go('F дворфы 5 клеток', n, tname, dawn, dict(BASE_RD, dwarf5=True), policy(dawn))
            go('G гвардия у Сайра с р.1', n, tname, dawn, dict(BASE_RD, guards_hold_sair_r12=True), policy(dawn))
            go('H без срыва, без решётки', n, tname, dawn, BASE_RD, policy(dawn, tear=False, portcullis=False))
    for tname, dawn in TABLES.items():
        for n in (6, 8):
            go('M порог в любой момент', n, tname, dawn, dict(BASE_RD, threshold_any_time=True), policy(dawn))
            go('N ничья в пользу героя', n, tname, dawn, dict(BASE_RD, tie_to_hero=True), policy(dawn))
            go('O рывок + решётка всегда', n, tname, dawn, BASE_RD, policy(dawn, tactic='rush', portcullis=True))
    # candidate fixes (not campaign text): tear only next to the stairs, one try per round; lower threshold
    for tname, dawn in TABLES.items():
        for n in (6, 8):
            go('X1 правка: срыв на рядах 11-12, раз в раунд', n, tname, dawn, dict(BASE_RD, tear_row=10, tear_once=True), policy(dawn))
            go('X2 правка: X1 + порог 20', n, tname, dawn, dict(BASE_RD, tear_row=10, tear_once=True, thr=20), policy(dawn))
            go('X3 правка: X2, рывок на Сайра', n, tname, dawn, dict(BASE_RD, tear_row=10, tear_once=True, thr=20), policy(dawn, tactic='rush'))
            go('X4 правка: X2 + Сайр КД 16, две атаки', n, tname, dawn, dict(BASE_RD, tear_row=10, tear_once=True, thr=20, sair_ac=16, sair_attacks=2), policy(dawn))
            go('X5 правка: X4 + лежащий ступень не держит', n, tname, dawn, dict(BASE_RD, tear_row=10, tear_once=True, thr=20, sair_ac=16, sair_attacks=2, prone_no_block=True), policy(dawn))
    tl = dict(TABLES['бросил низ'], alliance='late')
    for n in (6, 8):
        go('I бросил низ + союз через гонца', n, 'бросил низ', tl, BASE_RD, policy(tl))
        go('J ворота: снятые соседями — не упавшие', n, 'ворота', TABLES['ворота'],
           dict(BASE_RD, nb_removed_are_fallen=False), policy(TABLES['ворота']))
        dz = dict(TABLES['понемногу'], gates=0)
        go('K понемногу при Воротах 0', n, 'понемногу', dz, BASE_RD, policy(dz))
        d5 = dict(TABLES['ворота'], gates=5)
        go('L ворота при Воротах 5', n, 'ворота', d5, BASE_RD, policy(d5))
    json.dump(out, open(__file__.replace('gate_sim.py', 'results.json'), 'w'), ensure_ascii=False, indent=1)
