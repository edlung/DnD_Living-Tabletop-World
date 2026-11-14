"""Round-4 rules of roof-duel (K-relative entries, Falk shots = wounds, Klara (b) leaves, seen-only rivals)."""
import collections
from roof import *
import roof

EXTRA = [  # clones from variants/8-players.json
    ('Зоя', 31, 11, dict(atk=5, dmg=(6, 3), ath=5, acro=0, ini=1)),
    ('Казимир', 20, 12, dict(atk=1, dmg=(6, -1), ath=0, acro=0, ini=2)),
    ('Яна', 24, 13, dict(atk=2, dmg=(6, 0), ath=0, acro=5, ini=3)),
    ('Тимон', 24, 11, dict(atk=3, dmg=(6, 1), ath=0, acro=0, ini=1, pers=4)),
]
START = [(2, 5), (2, 6), (2, 7), (2, 8), (1, 5), (1, 6), (1, 7), (1, 8)]

class Sim2(Sim):
    def __init__(s, seed, cfg, verbose=True):
        super().__init__(seed, cfg, verbose)
        n = cfg.get('n', 4)
        s.heroes = s.heroes[:min(n, 4)]
        for name, hp, ac, k in EXTRA[:max(0, n-4)]:
            s.heroes.append(C(name, hp, ac, 'h', **k))
        for h, p in zip(s.heroes, START): h.pos = p
        s.H = {h.name: h for h in s.heroes}
        K = cfg['k_in']
        s.cfg = dict(cfg)
        s.cfg['w_in'] = K + cfg['w_off'] if cfg.get('w_off') is not None else None
        s.cfg['l_in'] = (s.cfg['w_in'] + 1) if cfg.get('artel', True) and s.cfg['w_in'] else None
        s.cfg['falk'] = K + (7 if n >= 6 else 9) - (2 if cfg.get('falk_called') else 0)
        s.cfg['exit'] = 36 if n == 3 else 30
        s.carry = False

    def walk(s, me, p, budget, skill=0):
        r = super().walk(me, p, budget, skill)
        return r

    # moving target: only Saveliy's own last turn counts (set in sv_turn)
    def shot_mods(s, src, tgt, final=False):
        rng = d(src, tgt)
        if rng > 8 and not final: return None
        adv = 0; ac = 12
        near_frame = any(d(src, f) <= 1 for f in FRAMES)
        if rng > 4 and not near_frame: adv = -1
        if s.sv.own_moved >= 2: adv = -1
        for k in range(1, 20):
            t = k / 20
            c = (round(src[0] + (tgt[0]-src[0])*t), round(src[1] + (tgt[1]-src[1])*t))
            if c in COVER and c != src and c != tgt: ac += 5; break
        return adv, ac
    def shoot_sv(s, final=False):
        m = s.shot_mods(s.kl.pos, s.sv.pos, final)
        if m is None: s.L("Клара: >8 — выстрел нельзя"); return
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
        res = 'РАНА' if tot >= ac else 'мимо'
        if tot >= ac: s.sv.wounds -= 1
        s.L(f"Клара→Савелий {roll}+5={tot} vs{ac}{' пом' if adv<0 else ''} {res} (ост {s.sv.wounds})")

    def k_move(s, budget):
        """Klara moves toward Saveliy; heroes she leaves may strike with reaction."""
        k = s.kl
        before = [h for h in s.heroes if h.up() and d(h.pos, k.pos) == 1]
        _, p = s.path(k, s.adj_goal(s.sv.pos))
        if not p: return
        s.walk(k, p, budget, 4)
        for h in before:
            if h.up() and d(h.pos, k.pos) > 1 and h.react and k.up():
                guards = [x for x in s.heroes if x.up() and x.react and d(x.pos, s.sv.pos) == 1 and x is not h]
                if d(h.pos, s.sv.pos) == 1 and not guards: continue  # keep reaction for shield
                h.react = False; s.L(f"{h.name} бьёт уходящую Клару (реакция)")
                s.melee(h, k, h.atk, h.dmg)

    def klara_turn(s):
        k = s.kl
        if k.out or k.hp <= 0: return
        K = s.cfg['k_in']
        if s.rnd < K: return
        if s.rnd == K:
            k.pos = s.cfg['k_door']
            _, p = s.path(k, s.adj_goal(s.sv.pos))
            if p: s.walk(k, p, 3, 4)
            s.L(f"Клара входит → {k.pos}"); return
        climbed = s.climb(k)
        mv = 0 if climbed else 3
        adjh = lambda: [h for h in s.heroes if h.up() and d(h.pos, k.pos) == 1]
        holder = s.sv.holder if s.sv.holder in s.heroes else None
        pick = lambda hs: holder if holder in hs else min(hs, key=lambda h: h.hp)
        svd = d(k.pos, s.sv.pos)
        if k.word is not None:
            k.word = None
            if adjh():
                s.L("Клара (Слово) не стреляет, один удар"); s.melee(k, pick(adjh()), 5, (6, 3))
            else:
                s.L("Клара (Слово) не стреляет, идёт")
                if mv: s.k_move(mv + 1)
            return
        if k.shots >= 2:
            k.shots = 0; s.L("Клара перезаряжает (действие) и идёт")
            if mv and svd > 1: s.k_move(mv)
            return
        if adjh():
            if svd <= 6:
                s.melee(k, pick(adjh()), 5, (6, 3)); s.shoot_sv(); k.shots += 1
            else:
                s.melee(k, pick(adjh()), 5, (6, 3))
                s.L("Клара: Савелий >6 — уходит от героя")
                if mv: s.k_move(mv)
            return
        if svd <= 6:
            s.shoot_sv(); k.shots += 1
            if mv: s.k_move(mv)
            return
        if mv: s.k_move(mv + 1); s.L(f"Клара Рывком → {k.pos}")

    def rival_turn(s, rv):
        if not rv.up(): return
        sv = s.sv
        seen = s.cfg['seen'].get(rv.team)
        if rv.team == 'ч' and s.cfg['helga']:
            return Sim.rival_turn(s, rv)
        if sv.holder is rv:
            if s.climb(rv): return
            ex = s.exits(rv.team)
            cost, p = s.path(rv, lambda c: c in ex, jump=False, ex=(sv,))
            if p:
                s.walk(rv, p, 2); s.L(f"{rv.name} ведёт Савелия → {rv.pos}")
            else:
                # put the plank back
                for b in s.bridges:
                    if not s.bridges[b] and d(rv.pos, b) <= 1:
                        s.bridges[b] = True; s.L(f"{rv.name} кладёт мосток {b} обратно"); return
                _, p = s.path(rv, lambda c: any(not s.bridges[b] and d(c, b) == 1 for b in s.bridges), jump=False, ex=(sv,))
                if p: s.walk(rv, p, 2); s.L(f"{rv.name} тащит Савелия к мостку → {rv.pos}")
                else: s.L(f"{rv.name} держит Савелия")
            return
        if not seen and sv.holder in s.heroes:
            home = [(20, 7), (20, 8), (19, 7)] if rv.team == 'ч' else [(14, 12), (15, 12), (13, 12)]
            if d(rv.pos, home[0]) > 1 and rv.hang is None:
                _, p = s.path(rv, lambda c: d(c, home[0]) <= 1)
                if p: s.walk(rv, p, 3, rv.sk)
            return
        return Sim.rival_turn(s, rv)

    def sv_turn(s):
        before = s.sv.pos
        Sim.sv_turn(s)
        s.sv.own_moved = 0 if s.sv.holder else d(before, s.sv.pos) if s.sv.pos else 0
        if s.sv.holder is None and s.sv.pos != before:
            s.sv.own_moved = max(s.sv.own_moved, getattr(s.sv, 'moved', 0))

    def end_check(s):
        sv, k = s.sv, s.kl
        if sv.wounds <= 0: return 'Последний свидетель'
        if sv.holder in s.rivals and sv.holder.pos in s.exits(sv.holder.team): return 'В чужих руках (увели)'
        def p3():
            def counts(r):
                return r.up() and s.cfg['seen'].get(r.team) and not (r.team == 'ч' and s.cfg['helga']) \
                    and (sv.holder is r or d(r.pos, sv.pos) == 1)
            if sv.holder in s.rivals and counts(sv.holder): return 'В чужих руках (команда)'
            hero = (sv.holder in s.heroes and sv.holder.up()) or any(h.up() and d(h.pos, sv.pos) == 1 for h in s.heroes)
            rv = any(counts(r) for r in s.rivals)
            if hero and not rv: return 'Живым'
            if rv: return 'В чужих руках (команда)'
            return 'В чужих руках (Фальк)'
        if k.out: return p3()
        if s.rnd == s.cfg['falk']:
            n = sv.wounds; s.L(f"Фальк: Клара стреляет {n} раз")
            for _ in range(n):
                if sv.wounds > 0: s.shoot_sv(final=True)
            if sv.wounds <= 0: return 'Последний свидетель'
            k.out = True; return p3()
        return None

    def run(s):
        s.sv.own_moved = 0
        ini = [(s.r() + h.ini, h) for h in s.heroes] + [(s.r() + 3, s.kl)]
        ini.sort(key=lambda t: -t[0])
        s.log.append("  иниц: " + ", ".join(f"{c.name} {v}" for v, c in ini))
        for s.rnd in range(1, 25):
            for c in s.heroes + [s.kl] + s.rivals: c.react = True
            s.spawn()
            for _, c in ini:
                if c is s.kl:
                    s.klara_turn()
                    if s.kl.up() and s.kl.hp <= s.cfg['exit']:
                        s.kl.out = True; s.L(f"Клара {s.kl.hp} — садится")
                    for rv in list(s.rivals): s.rival_turn(rv)
                else:
                    s.hero_turn(c)
                    if s.kl.up() and s.kl.hp <= s.cfg['exit']:
                        s.kl.out = True; s.L(f"Клара {s.kl.hp} — садится")
                    for rv in s.rivals:
                        if rv.up() and rv.hp <= 0 and not rv.out: s.rival_down(rv)
            s.sv.moved = 0
            s.sv_turn()
            e = s.end_check()
            if e: s.ended = (s.rnd, e); break
        hp = ", ".join(f"{h.name[:2]}{max(h.hp,0)}" for h in s.heroes)
        s.log.append(f"  ИТОГ: раунд {s.ended[0]} (К={s.cfg['k_in']}, Фальк {s.cfg['falk']}) — {s.ended[1]}; Клара {s.kl.hp}, раны {s.sv.wounds}, {hp}")
        return s

BASE = dict(k_door=(20, 6), exit=30, holder='Ванда', guard=None, wordman='Роман', home=['Ванда', 'Регина'],
            fort=(3, 6), strategy='engage', pull_bridge=True, push=True)
ATT2 = dict(BASE, n=4, sv=(8, 6), wounds=3, trust=True, words=3, k_in=4, w_off=4, artel=False,
            per_team=1, seen={}, helga=True, falk_called=True)
MID2 = dict(BASE, n=4, sv=(10, 6), wounds=3, trust=True, words=1, k_in=3, w_off=3,
            per_team=2, seen={'ч': 1, 'г': 1}, helga=False)
NOI2 = dict(BASE, n=4, sv=(11, 6), wounds=2, trust=False, words=0, k_in=1, w_off=2,
            per_team=2, seen={'ч': 1, 'г': 1}, helga=False)
NOI3 = dict(NOI2, n=3, per_team=1)
MID8 = dict(MID2, n=8, per_team=3)

def mc(name, cfg, n=400):
    out = collections.Counter(); rounds = []; after = []; kexit = 0
    for seed in range(1000, 1000+n):
        s = Sim2(seed, cfg).run()
        out[s.ended[1]] += 1; rounds.append(s.ended[0]); after.append(s.ended[0] - s.cfg['k_in'] + 1)
        kexit += any('садится' in l for l in s.log)
    rounds.sort(); after.sort()
    print(f"{name}: " + ", ".join(f"{k} {v*100/n:.0f}%" for k, v in out.most_common()) +
          f" | раунд мед {rounds[n//2]} ({rounds[n//10]}–{rounds[9*n//10]}), после входа К мед {after[n//2]} | Клара сбита {kexit*100//n}%")

class Sim3(Sim2):
    """adds a bridge-puller: keeps 7/4 removed while Saveliy is on Pel's house"""
    def hero_turn(s, h):
        b = (7, 4); sv = s.sv; k = s.kl
        if h.name == s.cfg.get('puller') and h.up() and h.hang is None and sv.pos and region(sv.pos) == 'W' \
           and not (k.up() and k.pos and region(k.pos) in ('W',)) :
            if s.bridges[b]:
                if d(h.pos, b) > 1 or region(h.pos) != 'W':
                    _, p = s.path(h, lambda c: d(c, b) == 1 and region(c) == 'W', jump=False)
                    if p: s.walk(h, p, 3)
                if d(h.pos, b) == 1 and region(h.pos) == 'W' and not any(c.pos == b for c in s.heroes + [k, sv] + s.rivals if c.pos):
                    s.bridges[b] = False; s.L(f"{h.name} снимает доску 7/4"); s.pulled = getattr(s, 'pulled', 0) + 1
                return
        return Sim2.hero_turn(s, h)

def mc3(name, cfg, n=400, cls=None):
    cls = cls or Sim3
    out = collections.Counter(); rounds = []; after = []; kexit = 0; pulled = 0; putback = 0
    for seed in range(1000, 1000+n):
        s = cls(seed, cfg).run()
        out[s.ended[1]] += 1; rounds.append(s.ended[0]); after.append(s.ended[0] - s.cfg['k_in'] + 1)
        kexit += any('садится' in l for l in s.log); pulled += getattr(s, 'pulled', 0) > 0
        putback += any('обратно' in l for l in s.log)
    rounds.sort(); after.sort()
    print(f"{name}: " + ", ".join(f"{k} {v*100/n:.0f}%" for k, v in out.most_common()) +
          f" | раунд мин {rounds[0]} мед {rounds[n//2]}, после К мин {after[0]} мед {after[n//2]} макс {after[-1]} | Клара сбита {kexit*100//n}% | мосток снят {pulled*100//n}%, возвращён {putback*100//n}%")
