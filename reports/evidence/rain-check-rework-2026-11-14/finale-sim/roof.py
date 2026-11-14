import random, heapq, sys

W, H = 20, 12
GAPS = (7, 12)
PIPE = (6, 11); FRAMES = [(15, 8), (16, 11)]
COVER = [PIPE] + FRAMES

def d(a, b): return max(abs(a[0]-b[0]), abs(a[1]-b[1]))
def adjacent_cell(a,b): return d(a,b)==1
def region(c):
    x = c[0]
    return 'W' if x <= 6 else 'G' if x in GAPS else 'M' if x <= 11 else 'E'

class C:
    def __init__(s, name, hp, ac, kind, **k):
        s.name, s.hp, s.maxhp, s.ac, s.kind = name, hp, hp, ac, kind
        s.pos = None; s.hang = None; s.prone = False; s.out = False
        s.react = True; s.hitby = set(); s.__dict__.update(k)
    def up(s): return not s.out and s.hp > 0 and s.pos is not None

class Sim:
    def __init__(s, seed, cfg, verbose=True):
        s.R = random.Random(seed); s.cfg = cfg; s.log = []; s.v = verbose
        s.bridges = {(7, 4): True, (12, 1): True}
        s.heroes = [
            C('Ванда', 31, 11, 'h', atk=5, dmg=(6, 3), ath=5, acro=0, ini=1),
            C('Конрад', 24, 13, 'h', atk=2, dmg=(6, 0), ath=0, acro=5, ini=3),
            C('Роман', 20, 12, 'h', atk=1, dmg=(6, -1), ath=0, acro=0, ini=2),
            C('Регина', 24, 11, 'h', atk=3, dmg=(6, 1), ath=0, acro=0, ini=1, pers=4)]
        for h, p in zip(s.heroes, [(2, 5), (2, 6), (2, 7), (2, 8)]): h.pos = p
        s.H = {h.name: h for h in s.heroes}
        s.kl = C('Клара', 52, 15, 'k', ini=3, ath=4); s.kl.shots = 0; s.kl.word = None
        s.sv = C('Савелий', 0, 12, 's'); s.sv.pos = cfg['sv']; s.sv.wounds = cfg['wounds']
        s.sv.holder = None; s.sv.moved = 0
        s.rivals = []; s.teams = {}
        s.words = cfg['words']; s.word_round = -1
        s.ended = None; s.rnd = 0

    def L(s, t): s.log.append(f"  р{s.rnd}: {t}")
    def r(s, n=20): return s.R.randint(1, n)
    def d20(s, adv=0):
        a, b = s.r(), s.r()
        return max(a, b) if adv > 0 else min(a, b) if adv < 0 else a
    def dmg(s, die):
        return max(1, s.r(die[0]) + die[1])

    # ---------- geometry ----------
    def occ(s, ex=()):
        o = set()
        for c in s.heroes + [s.kl, s.sv] + s.rivals:
            if c in ex or c.pos is None or c.out: continue
            o.add(c.pos)
        return o
    def walkable(s, c):
        x, y = c
        if not (1 <= x <= W and 1 <= y <= H): return False
        if x in GAPS: return s.bridges.get(c, False)
        return True
    def path(s, me, goal_fn, jump=True, ex=()):
        blocked = s.occ(ex=(me,) + tuple(ex))
        st = me.pos; pq = [(0, st, [])]; seen = {}
        while pq:
            cost, c, p = heapq.heappop(pq)
            if c in seen and seen[c] <= cost: continue
            seen[c] = cost
            if goal_fn(c) and c not in blocked: return cost, p
            if cost > 40: continue
            x, y = c
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    n = (x+dx, y+dy)
                    if n == c or not s.walkable(n) or n in blocked: continue
                    heapq.heappush(pq, (cost+1, n, p + [(n, 1)]))
            if jump and x in (6, 8, 11, 13):
                tx = {6: 8, 8: 6, 11: 13, 13: 11}[x]
                for dy in (-1, 0, 1):
                    n = (tx, y+dy)
                    if 1 <= n[1] <= H and n not in blocked:
                        heapq.heappush(pq, (cost+3, n, p + [(n, 3)]))
        return None, None
    def walk(s, me, p, budget, skill=0):
        """follow path p up to budget; jumps need a check. returns spent"""
        spent = 0
        for n, c in p:
            if spent + c > budget: break
            if c == 3:
                roll = s.r() + skill
                if roll < 12:
                    gx = 7 if 7 in (me.pos[0]+1, me.pos[0]-1) else 12
                    side = me.pos
                    me.hang = side; me.pos = (gx, me.pos[1]); dm = s.r(4); me.hp -= dm
                    s.L(f"{me.name} прыжок {roll}<12 → карниз, -{dm} ({me.hp})")
                    return budget
                s.L(f"{me.name} прыжок {roll}✓")
            if me is s.sv.holder:
                old = me.pos; me.pos = n; s.sv.pos = old; s.sv.moved += c
            else:
                me.pos = n
            spent += c
        return spent
    def adj_goal(s, tgt): return lambda c: d(c, tgt) == 1 and c[0] not in GAPS
    def climb(s, me):
        if me.hang is None: return False
        side = me.hang; me.hang = None
        # adjacent roof cell on that side
        cands = [(side[0], me.pos[1]+dy) for dy in (0, -1, 1)]
        o = s.occ(ex=(me,))
        for c in cands:
            if 1 <= c[1] <= H and c not in o: me.pos = c; break
        else: me.pos = side
        s.L(f"{me.name} выбирается на {me.pos}")
        return True

    # ---------- combat ----------
    def melee(s, a, t, atk, die, adv=0):
        if t.hang is not None or (t.prone and t.up()): adv = 1
        roll = s.d20(adv); tot = roll + atk
        if tot >= t.ac:
            dm = s.dmg(die); t.hp -= dm; t.hitby.add(a.name)
            s.L(f"{a.name}→{t.name} {roll}+{atk}={tot} попал {dm} ({max(t.hp,0)})")
            if t.kind == 'h' and t.hp <= 0: s.ko(t)
            return True
        s.L(f"{a.name}→{t.name} {roll}+{atk}={tot} мимо")
        return False
    def ko(s, h):
        h.hp = 0; s.L(f"{h.name} без сознания")
        if s.sv.holder is h: s.sv.holder = None
    def shot_mods(s, src, tgt):
        rng = d(src, tgt)
        if rng > 8: return None
        adv = 0; ac = 12
        near_frame = any(d(src, f) <= 1 for f in FRAMES)
        if rng > 4 and not near_frame: adv = -1
        if s.sv.moved >= 2: adv = -1
        for k in range(1, 20):
            t = k / 20
            c = (round(src[0] + (tgt[0]-src[0])*t), round(src[1] + (tgt[1]-src[1])*t))
            if c in COVER and c != src and c != tgt: ac += 5; break
        return adv, ac
    def shoot_sv(s, final=False):
        m = s.shot_mods(s.kl.pos, s.sv.pos)
        if m is None: s.L("Клара: до Савелия >8 — выстрел нельзя"); return
        adv, ac = m
        if not final:
            sh = [h for h in s.heroes if h.up() and h.react and d(h.pos, s.sv.pos) == 1]
            if sh:
                h = max(sh, key=lambda x: x.hp); h.react = False
                dm = s.r(10) + 3; h.hp -= dm
                s.L(f"Клара стреляет, {h.name} заслоняет: -{dm} ({max(h.hp,0)})")
                if h.hp <= 0: s.ko(h)
                return
        roll = s.d20(adv); tot = roll + 5
        if tot >= ac:
            s.sv.wounds -= 1
            s.L(f"Клара стреляет в Савелия {roll}+5={tot} vs{ac}{' пом' if adv<0 else ''} РАНА (ост {s.sv.wounds})")
        else:
            s.L(f"Клара стреляет в Савелия {roll}+5={tot} vs{ac}{' пом' if adv<0 else ''} мимо")

    # ---------- Klara ----------
    def klara_turn(s):
        k = s.kl
        if k.out or k.hp <= 0: return
        if s.rnd == s.cfg['k_in']:
            k.pos = s.cfg['k_door']
            _, p = s.path(k, s.adj_goal(s.sv.pos))
            if p: s.walk(k, p, 3, 4)
            s.L(f"Клара входит → {k.pos}: «Савелий. Ты весь мокрый»")
            return
        if s.rnd < s.cfg['k_in']: return
        if s.climb(k):
            budget = 0
        else: budget = None
        adjh = [h for h in s.heroes if h.up() and h.pos and d(h.pos, k.pos) == 1]
        if k.hang is None and k.word is not None:
            w = k.word; k.word = None
            if d(w.pos, k.pos) > 1 and budget is None and w.up():
                _, p = s.path(k, s.adj_goal(w.pos));
                if p: s.walk(k, p, 3, 4)
            if w.up() and d(w.pos, k.pos) == 1:
                s.L("Клара (Слово) не стреляет, бьёт тростью раз")
                s.melee(k, w, 5, (6, 3))
            else: s.L("Клара (Слово) не стреляет")
            return
        loaded = k.shots < 2
        svd = d(k.pos, s.sv.pos)
        holder = s.sv.holder if s.sv.holder in s.heroes else None
        if adjh:
            if loaded and svd <= 6:
                t = holder if holder in adjh else min(adjh, key=lambda h: h.hp)
                s.melee(k, t, 5, (6, 3)); s.shoot_sv(); k.shots += 1
            else:
                if not loaded: k.shots = 0; s.L("Клара перезаряжает")
                for _ in range(2):
                    adjh = [h for h in s.heroes if h.up() and d(h.pos, k.pos) == 1]
                    if not adjh: break
                    t = holder if holder in adjh else min(adjh, key=lambda h: h.hp)
                    s.melee(k, t, 5, (6, 3))
            return
        if not loaded:
            k.shots = 0; s.L("Клара перезаряжает и идёт")
            if budget is None:
                _, p = s.path(k, s.adj_goal(s.sv.pos))
                if p: s.walk(k, p, 3, 4)
            return
        if svd <= 6:
            s.shoot_sv(); k.shots += 1
            if budget is None:
                _, p = s.path(k, s.adj_goal(s.sv.pos))
                if p: s.walk(k, p, 3, 4)
            return
        if budget is None:
            _, p = s.path(k, s.adj_goal(s.sv.pos))
            if p: s.walk(k, p, 4, 4)
            s.L(f"Клара Рывком → {k.pos}")

    # ---------- rivals ----------
    def spawn(s):
        for team, rin, cells, hp, ac, atk, die, sk in [
            ('ч', s.cfg['w_in'], [(20, 7), (20, 8), (19, 7)], 16, 13, 4, (8, 2), 4),
            ('г', s.cfg['l_in'], [(14, 12), (15, 12), (13, 12)], 32, 12, 4, (6, 2), 4)]:
            if rin is None or s.rnd != rin: continue
            n = s.cfg['per_team']
            for i in range(n):
                rv = C(f"{team}{i+1}", hp, ac, 'r', team=team, atk=atk, die=die, sk=sk, holding=False)
                rv.pos = cells[i]; s.rivals.append(rv)
            s.teams[team] = n; s.L(f"входят {'часовщики' if team=='ч' else 'грузчики'} ×{n}")
    def exits(s, team):
        return ([(20, 7)] if team == 'ч' else [(14, 12), (15, 12)]) + [(9, 2)]
    def rival_turn(s, rv):
        if not rv.up(): return
        if s.climb(rv): budget = 0
        else: budget = None
        sv = s.sv
        if rv.team == 'ч' and s.cfg['helga']:
            if s.kl.up():
                if budget is None and d(rv.pos, s.kl.pos) > 4:
                    _, p = s.path(rv, lambda c: d(c, s.kl.pos) <= 4)
                    if p: s.walk(rv, p, 3, rv.sk)
                if s.rnd not in s.teams.get('shot', set()) and d(rv.pos, s.kl.pos) <= 8:
                    s.teams.setdefault('shot', set()).add(s.rnd)
                    adv = -1 if d(rv.pos, s.kl.pos) > 4 else 0
                    roll = s.d20(adv) + 4
                    if roll >= 15:
                        dm = s.dmg((8, 2)); s.kl.hp -= dm; s.L(f"{rv.name} стреляет в Клару {roll} попал {dm} ({s.kl.hp})")
                    else: s.L(f"{rv.name} стреляет в Клару {roll} мимо")
            return
        if sv.holder is rv:
            ex = s.exits(rv.team)
            cost, p = s.path(rv, lambda c: c in ex, jump=False, ex=(sv,))
            if p and budget is None:
                s.walk(rv, p, 2); s.L(f"{rv.name} ведёт Савелия → {rv.pos}")
            else: s.L(f"{rv.name} держит Савелия, выхода без прыжка нет")
            return
        # attack someone who hit me, if adjacent and Saveliy not grabbable
        if budget is None and d(rv.pos, sv.pos) > 1:
            _, p = s.path(rv, s.adj_goal(sv.pos))
            if p: s.walk(rv, p, 3, rv.sk)
        if d(rv.pos, sv.pos) == 1 and sv.wounds > 0:
            if sv.holder is None:
                sv.holder = rv; s.L(f"{rv.name} берёт свободного Савелия"); return
            if sv.holder in s.heroes and s.cfg['seen'].get(rv.team):
                h = sv.holder
                others = [x for x in s.heroes if x is not h and x.up() and d(x.pos, sv.pos) == 1]
                a = s.r() + 2; b = s.d20(1 if others else 0) + max(h.ath, h.acro)
                if a > b:
                    sv.holder = rv; s.L(f"{rv.name} отнимает Савелия у {h.name} {a}>{b}")
                else: s.L(f"{rv.name} тянет Савелия у {h.name} {a}≤{b}")
                return
        foes = [h for h in s.heroes if h.up() and h.name in rv.hitby and d(h.pos, rv.pos) <= (8 if rv.team == 'ч' else 1)]
        if foes:
            t = foes[0]
            for _ in range(2 if rv.team == 'ч' else 1):
                if t.up(): s.melee(rv, t, rv.atk, rv.die, -1 if rv.team == 'ч' and d(t.pos, rv.pos) > 4 else 0)
    def rival_down(s, rv):
        rv.out = True; s.L(f"{rv.name} выбит")
        if s.sv.holder is rv: s.sv.holder = None
        team = rv.team; downs = sum(1 for x in s.rivals if x.team == team and x.hp <= 0)
        if downs >= (s.teams[team] + 1)//2:
            for x in s.rivals:
                if x.team == team and not x.out:
                    x.out = True
                    if s.sv.holder is x: s.sv.holder = None
            s.L(f"команда {team} уходит")

    # ---------- heroes ----------
    def hero_turn(s, h):
        if not h.up(): return
        st = s.cfg['strategy']; sv = s.sv; k = s.kl
        budget = 0 if s.climb(h) else 3
        sk = max(h.ath, h.acro)
        kin = k.up() and k.pos is not None
        def move_to(goal, b, jump=True, ex=()):
            if b <= 0: return 0
            cost, p = s.path(h, goal, jump=jump, ex=ex)
            if not p: return 0
            return s.walk(h, p, b, sk)
        def adjacent(t): return t.pos is not None and d(h.pos, t.pos) == 1 and h.hang is None
        def try_word():
            if s.words > 0 and s.word_round != s.rnd and k.word is None and kin and k.hang is None \
               and k.shots < 2 and d(h.pos, k.pos) <= 6 and d(k.pos, sv.pos) <= 7 and h.hang is None:
                s.words -= 1; s.word_round = s.rnd; k.word = h
                s.L(f"{h.name}: Слово (ост {s.words})"); return True
            return False
        def hit(t):
            s.melee(h, t, h.atk, h.dmg)
            if t is not k and t.hp <= 0 and not t.out: s.rival_down(t)
        def strike_klara():
            if s.cfg.get('stall'):
                try_word(); return
            if s.cfg.get('push') and h.ath >= 5 and k.pos[0] in (6, 8, 11, 13) and k.hang is None:
                a = s.r() + h.ath; b = s.r() + 4
                if a > b:
                    gx = 7 if k.pos[0] in (6, 8) else 12
                    k.hang = k.pos; k.pos = (gx, k.pos[1]); dm = s.r(4); k.hp -= dm
                    s.L(f"{h.name} сталкивает Клару в проём {a}>{b}, -{dm} ({k.hp})")
                else: s.L(f"{h.name} толкает Клару {a}≤{b}")
                return
            if h.name == s.cfg.get('wordman') and try_word(): return
            if s.cfg.get('smart') and k.hp <= s.cfg['exit'] + 9 and any(rv.up() and d(rv.pos, sv.pos) <= 3 for rv in s.rivals):
                if not try_word(): s.L(f"{h.name} держит Клару, не бьёт (рядом соперники)")
                return
            hit(k)
        threats = [rv for rv in s.rivals if rv.up() and d(rv.pos, sv.pos) <= 2]
        # ---- holder
        if sv.holder is h:
            pref = s.H.get(s.cfg['holder'])
            if pref is not h and pref.up() and d(pref.pos, sv.pos) == 1:
                sv.holder = pref; s.L(f"{h.name} передаёт Савелия {pref.name}")
            else:
                b = max(0, budget - 1)
                fight_here = kin and d(k.pos, sv.pos) <= 2
                tgt = s.cfg['fort']
                if b and not fight_here and d(sv.pos, tgt) > 0:
                    _, p = s.path(h, lambda c: d(c, tgt) <= 1, jump=False, ex=(sv,))
                    if p: s.walk(h, p, b); s.L(f"{h.name} ведёт Савелия → {h.pos}/{sv.pos}")
                if s.cfg.get('pull_bridge') and s.bridges[(7, 4)] and region(sv.pos) == 'W' and adjacent_cell(h.pos, (7, 4)) \
                   and all(x.hp <= 0 or region(x.pos) == 'W' for x in s.heroes if x.name in s.cfg.get('home', [])):
                    s.bridges[(7, 4)] = False; s.L(f"{h.name} снимает доску 7/4"); return
                if kin and adjacent(k): strike_klara(); return
                for rv in threats:
                    if adjacent(rv): hit(rv); return
                try_word(); return
        # ---- rescue Saveliy from rival
        if sv.holder in s.rivals and sv.wounds > 0:
            rv = sv.holder
            if d(h.pos, rv.pos) <= budget + 1 + (3 if True else 0):
                if not adjacent(rv): budget -= move_to(s.adj_goal(rv.pos), budget)
                if adjacent(rv):
                    a = s.r() + h.ath; b = s.r() + 2
                    if a > b: sv.holder = h; s.L(f"{h.name} отбивает Савелия {a}>{b}")
                    else: s.L(f"{h.name} не отбил {a}≤{b}")
                    return
        # ---- take free Saveliy
        if sv.holder is None and sv.wounds > 0 and (h.name in (s.cfg['holder'], 'Регина') or d(h.pos, sv.pos) <= 1):
            if d(h.pos, sv.pos) > 1: budget -= move_to(s.adj_goal(sv.pos), budget)
            if adjacent(sv):
                if s.cfg['trust']: sv.holder = h; s.L(f"{h.name} берёт Савелия (Доверие)")
                else:
                    roll = s.r() + max(h.ath, getattr(h, 'pers', 0))
                    if roll >= 13: sv.holder = h
                    s.L(f"{h.name} берёт Савелия {roll} {'✓' if roll >= 13 else '✗'}")
                return
            if sv.holder is None and h.name == s.cfg['holder']: return
        downed = [x for x in s.heroes if x.hp <= 0 and not x.out and d(x.pos, h.pos) == 1]
        enemy_adj = (kin and adjacent(k)) or any(adjacent(rv) for rv in s.rivals if rv.up())
        if downed and not enemy_adj:
            x = downed[0]; x.hp = 1; s.L(f"{h.name} поднимает {x.name}"); return
        role = 'guard' if h.name == s.cfg.get('guard') else 'icp'
        if role == 'guard':
            if d(h.pos, sv.pos) > 1: budget -= move_to(s.adj_goal(sv.pos), budget)
            if kin and adjacent(k): strike_klara(); return
            for rv in sorted(threats, key=lambda r: r.hp):
                if adjacent(rv): hit(rv); return
            try_word(); return
        # interceptor
        targets = []
        if kin and s.rnd >= s.cfg['k_in']: targets.append(k)
        live = [rv for rv in s.rivals if rv.up() and d(rv.pos, sv.pos) <= 5]
        if s.cfg.get('smart') and live and h.name != s.cfg.get('pinner'):
            targets.insert(0, min(live, key=lambda r: (r.hp, d(r.pos, h.pos))))
        elif threats and not targets: targets.insert(0, min(threats, key=lambda r: r.hp))
        if not targets:
            stage = s.cfg.get('stage', {}).get(h.name, s.cfg['fort'])
            move_to(lambda c: d(c, stage) <= 2, budget, jump=False); return
        t = targets[0]
        if st == 'hold_line' and t is k and region(k.pos) != 'W' and k.hang is None and region(h.pos) == 'W':
            if h.pos[0] != 6: move_to(lambda c: c[0] == 6, budget, jump=False)
            if adjacent(k): strike_klara()
            else: try_word()
            return
        if not adjacent(t) and not (t.hang is not None and d(h.pos, t.pos) == 1):
            goal = (lambda c: d(c, t.pos) == 1 and region(c) != 'G')
            cost, p = s.path(h, goal, jump=s.cfg.get('icp_jump', True))
            if p:
                if cost > budget and cost <= budget + 1:
                    s.walk(h, p, budget + 1, sk); s.L(f"{h.name} Рывок → {h.pos}"); return
                budget -= s.walk(h, p, budget, sk)
        if h.hang is not None: return
        if d(h.pos, t.pos) == 1:
            if t is k: strike_klara()
            else: hit(t)
        else: try_word()


    # ---------- Saveliy ----------
    def sv_turn(s):
        sv = s.sv
        if sv.wounds <= 0: return
        if sv.holder is not None: return
        if any(h.up() and d(h.pos, sv.pos) == 1 for h in s.heroes): return
        if s.cfg['trust']:
            hs = [h for h in s.heroes if h.up()]
            if not hs: return
            _, p = s.path(sv, lambda c: any(d(c, h.pos) == 1 for h in hs), jump=False)
            if p: s.walk(sv, p, 3); sv.moved = min(3, len(p))
        else:
            o = s.occ(ex=(sv,)); steps = 0
            for _ in range(3):
                x, y = sv.pos; w = (x-1, y)
                if s.walkable(w) and w not in o: sv.pos = w
                elif s.walkable((x, y-1)) and (x, y-1) not in o: sv.pos = (x, y-1)
                else: break
                steps += 1
                if any(h.up() and d(h.pos, sv.pos) == 1 for h in s.heroes): break
            sv.moved = steps
        s.L(f"Савелий → {sv.pos}")

    def end_check(s):
        sv, k = s.sv, s.kl
        if sv.wounds <= 0: return 'Последний свидетель'
        if sv.holder in s.rivals and sv.holder.pos in s.exits(sv.holder.team): return 'В чужих руках (увели)'
        def p3():
            ok = (sv.holder in s.heroes) or any(h.up() and d(h.pos, sv.pos) == 1 for h in s.heroes)
            rv = any(r.up() and d(r.pos, sv.pos) <= 2 for r in s.rivals)
            return 'Живым' if ok and not rv else 'В чужих руках'
        if k.out: return p3()
        if s.rnd == s.cfg['falk']:
            s.L("Фальк: два последних выстрела")
            for _ in range(2):
                if sv.wounds > 0: s.shoot_sv(final=True)
            if sv.wounds <= 0: return 'Последний свидетель'
            k.out = True; return p3()
        if all(not h.up() for h in s.heroes): s.L("все герои без сознания")
        return None

    def run(s):
        ini = [(s.r() + h.ini, h) for h in s.heroes] + [(s.r() + 3, s.kl)]
        ini.sort(key=lambda t: -t[0])
        s.log.append("  иниц: " + ", ".join(f"{c.name} {v}" for v, c in ini))
        for s.rnd in range(1, 16):
            for c in s.heroes + [s.kl] + s.rivals: c.react = True
            s.sv.moved = s.sv.moved if s.rnd > 1 else 0
            s.spawn()
            for _, c in ini:
                if c is s.kl:
                    s.klara_turn()
                    if s.kl.up() and s.kl.hp <= s.cfg['exit']:
                        s.kl.out = True; s.L(f"Клара {s.kl.hp} — роняет пистолет и садится")
                    for rv in list(s.rivals): s.rival_turn(rv)
                else:
                    s.hero_turn(c)
                    if s.kl.up() and s.kl.hp <= s.cfg['exit']:
                        s.kl.out = True; s.L(f"Клара {s.kl.hp} — роняет пистолет и садится")
                    for rv in s.rivals:
                        if rv.up() and rv.hp <= 0: s.rival_down(rv)
            s.sv.moved = 0
            s.sv_turn()
            e = s.end_check()
            if e:
                s.ended = (s.rnd, e); break
        hp = ", ".join(f"{h.name[:2]}{max(h.hp,0)}" for h in s.heroes)
        s.log.append(f"  ИТОГ: раунд {s.ended[0] if s.ended else '-'} — {s.ended[1] if s.ended else 'нет'}; Клара {s.kl.hp}, раны ост {s.sv.wounds}, {hp}")
        return s

def show(title, seed, cfg, verbose=True):
    s = Sim(seed, cfg).run()
    print(f"== {title} seed={seed}")
    print("\n".join(s.log if verbose else s.log[-1:]))
    return s

ROLES = {'Ванда': 'hold', 'Регина': 'guard'}
ATT = dict(sv=(9, 6), wounds=3, trust=True, words=3, k_in=4, k_door=(20, 6), w_in=6, l_in=None,
           per_team=1, seen={}, helga=True, falk=8, exit=30, holder='Ванда', guard='Регина', wordman='Роман', home=['Ванда','Регина'], fort=(3, 6),
           strategy='hold_line', pull_bridge=True, push=True)
MID = dict(sv=(10, 6), wounds=3, trust=True, words=1, k_in=3, k_door=(20, 6), w_in=4, l_in=5,
           per_team=2, seen={'ч': 1, 'г': 1}, helga=False, falk=10, exit=30, holder='Ванда', guard='Регина', wordman='Роман', home=['Ванда','Регина'], fort=(3, 6),
           strategy='hold_line', pull_bridge=True, push=True)
NOI = dict(sv=(11, 6), wounds=2, trust=False, words=0, k_in=1, k_door=(20, 6), w_in=3, l_in=4,
           per_team=2, seen={'ч': 1, 'г': 1}, helga=False, falk=10, exit=30, holder='Ванда', guard='Регина', wordman='Роман', home=['Ванда','Регина'], fort=(3, 6),
           strategy='hold_line', pull_bridge=True, push=True)
