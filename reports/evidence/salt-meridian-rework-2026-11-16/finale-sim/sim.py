"""Evening 8 of salt-meridian ("Прорыв Трёх Устьев"): Monte Carlo of the printed rules.

Rules come only from the campaign text: encounters.json `chain-rock-battle`, sessions-4.json evening 8
(scenes + dmNote), handouts `strait-chart`, `rock-sketch`, `alarm-track`, `tide-table`, world.json
endings.  Where the text is ambiguous a READING flag (R_*) picks one interpretation; results.md lists
them and the sensitivity runs.

Stated abstractions (not in the text): the rock is reduced to zones whose distances were measured
on the printed 18x12 grid: landing J12 -> squares by the winch 9 (bridge K, no difficult terrain),
-> mast O3 10, winch <-> mast 4, A1-B1 -> next to I2 (winch) 6, -> next to J2 (brake) 7.  So Кречет
and the boarder cannot hit the brake holder in the round they land.  Inside the winch zone everyone
can reach everyone.  No opportunity attacks, no body-blocking, no shoving.  Fallen heroes are
"оглушены" (text): no death saves, Healing Word brings them back.
"""
import random, statistics, zlib

def d(n, s): return sum(random.randint(1, s) for _ in range(n))

def atk(bonus, ac, adv=False):
    r = random.randint(1, 20)
    if adv: r = max(r, random.randint(1, 20))
    if r == 1: return 0
    if r == 20: return 2
    return 1 if r + bonus >= ac else 0

class C:
    def __init__(s, name, kind, hp, ac, im, side):
        s.name, s.kind, s.hp, s.maxhp, s.ac, s.im, s.side = name, kind, hp, hp, ac, im, side
        s.zone, s.dist, s.up, s.present, s.init, s.role = 'S', 0, True, True, 0, None
        s.misty = s.hw = 0; s.sw = s.surge = False; s.fled = False; s.downs = 0
    def hurt(s, n):
        if not s.up or n <= 0: return
        s.hp -= n
        if s.hp <= 0: s.hp, s.up = 0, False; s.downs += 1
    def heal(s, n):
        s.hp = min(s.maxhp, s.hp + n); s.up = s.hp > 0

HERO_ORDER = [('Прохор', 'fighter'), ('Арина', 'rogue'), ('Василиса', 'cleric'), ('Фома', 'wizard'),
              ('Руся', 'fighter'), ('Ник', 'rogue'), ('Ася', 'cleric'), ('Денис', 'wizard')]
STATS = {'fighter': (31, 11, 1), 'rogue': (24, 13, 3), 'cleric': (24, 11, 1), 'wizard': (20, 12, 2)}

def hero_hit(h, t, adv):
    if h.kind == 'fighter': b, die, mod = 5, 8, 3
    elif h.kind == 'rogue': b, die, mod = 5, 8, 3
    elif h.kind == 'cleric': b, die, mod = 3, 6, 1
    else: b, die, mod = 1, 6, -1
    hit = atk(b, t.ac, adv)
    if not hit: return
    mult = 2 if hit == 2 else 1
    dmg = d(mult, die) + mod
    if h.kind == 'rogue': dmg += d(2 * mult, 6)  # sneak: Reckless advantage or an ally next to the target
    t.hurt(max(1, dmg))

# ------------------------------------------------------------------ strait
BIG, SMALL = 'B', 's'
class Ship:
    def __init__(s, name, size, lane):
        s.name, s.size, s.lane, s.row, s.state, s.bundle = name, size, lane, 0, 'sea', None

def blockade_setup(cfg):
    a, B = cfg['alarm'], []
    def add(n, cell, start, cap=1, kind='patrol', group='sig', aground=False):
        B.append(dict(name=n, cell=cell, start=start, cap=cap, kind=kind, group=group, aground=aground,
                      drift=False, gone=False, used=False))
    add('Тёрн', 'M', 1, group='boss')
    if 3 <= a <= 8: add('Сойка', 'N', 1)
    if a >= 9: add('Сойка', 'N', 1, aground=True)
    if 5 <= a <= 6: add('Камбала', 'E', 3)
    if 7 <= a <= 8: add('Камбала', 'E', 2)
    if a >= 9: add('Камбала', 'E', 1)        # 9-10 row names no start turn: read as turn 1
    if cfg['inna'] == 'none': add('Распорядок', 'E', 2)
    if a >= 7: add('флагман', 'E', 4 if a <= 8 else 2, cap=2, kind='flag', group='boss')
    if cfg['inna'] == 'given':
        for b in B:
            if b['name'] in ('Сойка', 'Камбала'): b['drift'] = True
    return B

def reach(cell, lane): return lane in ('M', 'N') if cell in ('M', 'N') else lane == 'M'

def active(b, t, cfg):
    if b['gone'] or b['drift'] or t < b['start']: return False
    if b['aground'] and b['used'] and cfg['R_aground'] == 'spent': return False
    return True

def blockade_act(B, ships, t, cfg, log):
    for b in B:
        if not active(b, t, cfg): continue
        for _ in range(b['cap']):
            pool = [s for s in ships if s.state == 'row3' and reach(b['cell'], s.lane)]
            if not pool: break
            cand = [s for s in pool if s.lane == b['cell']] or pool
            pick = next((s for s in cand if s.size == SMALL and s.bundle and s.bundle.state == 'row3'), None)
            if pick is None: pick = ([s for s in cand if s.size == BIG] or cand)[0]
            pick.state = 'taken'
            if pick.bundle: pick.bundle.bundle = None; pick.bundle = None
            log.append(f"    {b['name']} берёт {pick.name}")
            if b['kind'] == 'patrol':
                b['used'] = True
                if not b['aground'] or cfg['R_aground'] == 'leaves': b['gone'] = True
                break

def water_at(k, st):
    return 3 - (k >= 3) - (k >= 5) - (1 if st['drop_used'] else 0)

def shoal_ok(w, cfg, B, st, t):
    if any(b['aground'] and not b['drift'] and not b['gone'] for b in B): return False, False
    need = 1 if cfg['reef'] == 'pact' else 2
    if w >= need: return True, False
    if w == 1 and st['meter']: return True, True
    return False, False

def est_captures(opt, B, t, cfg):
    left = {'M': sum(1 for s in opt if s.lane == 'M'), 'N': sum(1 for s in opt if s.lane == 'N')}
    cap = 0
    for b in B:
        if not active(b, t, cfg): continue
        for _ in range(b['cap']):
            c = b['cell'] if left.get(b['cell']) else next((l for l in ('M', 'N') if left[l] and reach(b['cell'], l)), None)
            if c is None: break
            left[c] -= 1; cap += 1
            if b['kind'] == 'patrol': break
    return cap

def can_finish(live, tnext, st, cfg, B):
    """Optimistic: chain lies every remaining turn; water falls one extra step if not yet used."""
    bigs = sorted([s.row for s in live if s.size == BIG], reverse=True)
    smalls = len([s for s in live if s.size == SMALL])
    aground = any(b['aground'] and not b['drift'] and not b['gone'] for b in B)
    meter = st['meter']
    for k in range(tnext, 7):
        w = 3 - (k >= 3) - (k >= 5) - 1
        cap_chain = 2
        ready = [r for r in bigs if r + (k - tnext) >= 2]
        if ready:
            bigs.remove(ready[0]); cap_chain -= 1
        sm = min(cap_chain, smalls); smalls -= sm
        if smalls and not aground and (w >= (1 if cfg['reef'] == 'pact' else 2) or (w == 1 and meter)):
            if not (w >= (1 if cfg['reef'] == 'pact' else 2)): meter = False
            smalls -= 1
    return not bigs and smalls <= 0

def caravan_move(ships, t, chain, cfg, B, st, log):
    for s in ships:
        if s.state == 'row3': s.state = 'passed'; s.bundle = None
    live = [s for s in ships if s.state == 'sea']
    if not live: return
    w = water_at(t, st)
    sh, meter_needed = shoal_ok(w, cfg, B, st, t)
    big_ready = [s for s in live if s.size == BIG and s.lane == 'M' and s.row == 2]
    sm_chain = [s for s in live if s.size == SMALL and s.lane == 'M' and s.row >= 1]
    sm_shoal = [s for s in live if s.size == SMALL and s.lane == 'N' and s.row >= 1]
    opts = [[]]
    if chain:
        if big_ready:
            opts.append([big_ready[0]])
            if sm_chain: opts.append([big_ready[0], sm_chain[0]])
        if sm_chain: opts.append(sm_chain[:1])
        if len(sm_chain) >= 2: opts.append(sm_chain[:2])
    if sh and sm_shoal: opts += [o + [sm_shoal[0]] for o in opts]
    pol = cfg['policy']
    removable = False
    if pol in ('wait', 'sig'):
        for b in B:
            if not active(b, t, cfg) and not (not b['gone'] and not b['drift'] and b['start'] > t): continue
            if b['group'] == 'sig' and st['mast_team'] and not st['sig_up']: removable = True
            if b['group'] == 'boss' and pol == 'wait' and not st['boss_out'] and not (cfg.get('fix') == 'mate' and b['kind'] == 'flag'): removable = True
    forced = not can_finish(live, t + 1, st, cfg, B)
    best = None
    for o in opts:
        c = est_captures(o, B, t, cfg)
        if removable and not forced and c > 0: continue
        v = (len(o) - c, len(o))
        if best is None or v > best[0]: best = (v, o)
    choice = best[1]
    st['holds'] += int(removable and not forced and any(len(o) - est_captures(o, B, t, cfg) >= 0 and len(o) > len(choice) for o in opts))
    mships = [s for s in choice if s.lane == 'M']
    if len(mships) == 2 and any(s.size == BIG for s in mships):
        b = next(s for s in mships if s.size == BIG); m = next(s for s in mships if s.size == SMALL)
        b.bundle, m.bundle = m, b
    for s in choice:
        s.row, s.state = 3, 'row3'
        if s.lane == 'N' and meter_needed: st['meter'] = False
    # staging
    shoal_future = any(shoal_ok(water_at(k, st), cfg, B, st, k)[0] for k in range(t + 1, 7))
    trig = False
    for s in live:
        if s in choice: continue
        r0 = s.row
        if s.size == BIG:
            s.lane = 'M' if s.row <= 1 else s.lane
            s.row = min(2, s.row + 1)
        else:
            if s.lane == 'N' and not shoal_future:
                s.row = min(s.row, 1); s.lane = 'M'
            else:
                tgt = 1 if (cfg['R_drop'] == 'any_end' and not st['sig_up']) else 2
                if s.row < tgt: s.row = min(tgt, s.row + 2)
        if s.row == 2 and not st['sig_up']:
            if r0 == 2 or cfg['R_drop'] == 'any_end': trig = True
    if trig and not st['drop_used']:
        st['drop_used'] = True
        log.append('    вода −1 сверх срока (ряд 2 без сигнала)')
    log.append('    ' + ', '.join(f"{s.name}:{s.lane}{s.row}{'' if s.state=='sea' else '/'+s.state}" for s in ships))

# ------------------------------------------------------------------ one evening
def run(cfg, verbose=False):
    log = []
    n, a = cfg['players'], cfg['alarm']
    heroes = []
    for nm, k in HERO_ORDER[:n]:
        hp, ac, im = STATS[k]
        h = C(nm, k, hp, ac, im, 'hero'); h.dist = 9
        h.misty = 2 if k == 'wizard' else 0
        h.hw = 4 if k == 'cleric' else 0
        h.sw = h.surge = (k == 'fighter' and cfg['features'])
        heroes.append(h)
    tar = C('Тар', 'tar', 22, 12, 0, 'ally'); tar.dist = 10
    sig_need = 1 if cfg['book'] else 2
    mast = []
    # signal matters if some signal-group ship can be active and is not already drifting
    Bprobe = blockade_setup(cfg)
    sig_useful = any(b['group'] == 'sig' and not b['drift'] for b in Bprobe)
    if sig_useful and cfg['mast']:
        mast.append(next(h for h in heroes if h.kind == 'wizard'))
        if sig_need == 2:
            mast.append(next((h for h in heroes if h.name == 'Ник'), None) or next(h for h in heroes if h.name == 'Василиса'))
    for h in mast: h.role, h.dist = 'mast', 10
    nsent = {5: 2, 6: 2, 7: 3, 8: 3}[n]
    sentries = [C(f'Сторож{i+1}', 'bandit', 11, 12, 1, 'foe') for i in range(nsent)]
    for s in sentries: s.zone = 'W'
    boarder = C('Абордажник', 'bandit', 11, 12, 1, 'foe'); boarder.present = False
    boss = C('Кречет', 'boss', 67, 13, 1, 'foe'); boss.present = False
    boss_round = 1 if a >= 9 else (2 if a >= 5 else 3)
    reef = []
    if cfg['reef'] == 'hostile':
        nr = {5: 1, 6: 1, 7: 1, 8: 2}[n] if cfg['R_reefcount'] == 'package' else 2
        reef = [C(f'Риф{i+1}', 'sahuagin', 22, 12, 0, 'reef') for i in range(nr)]
        for r in reef: r.present = False
    for c in heroes + sentries + [boarder, boss] + reef: c.init = random.randint(1, 20) + c.im
    ships = [Ship('Чаша', BIG, 'M'), Ship('Сёстры', BIG, 'M'), Ship('Пескарь', SMALL, 'M'),
             Ship('Сверка', SMALL, 'N'), Ship('Складень', SMALL, 'N')]
    B = blockade_setup(cfg)
    st = dict(stopper=False, knocks=0, sig_up=False, sig_prog=0, sig_last=-9, sig_round=None,
              drop_used=False, meter=True, boss_out=False, boss_out_round=None, mast_team=bool(mast),
              chain_turns=[], allout=False, holder=None, j2_blocked=False, holds=0, decisions=[])
    tar_speed = 12 if cfg['R_tardash'] else 6

    def pending_late(t):
        return cfg['R_late'] == 'present_only' and any(
            b['group'] == 'sig' and not b['drift'] and not b['gone'] and b['start'] > t for b in B)

    def boss_check(t):
        if not st['boss_out'] and boss.present and boss.hp <= 10:
            st['boss_out'], st['boss_out_round'] = True, t
            log.append(f'  R{t}: Кречет {"сдаётся" if boss.up else "падает"} ({boss.hp} хитов)')

    for t in range(1, 7):
        if t == boss_round:
            for c in (boss, boarder):
                c.present, c.zone = True, 'X'
        if t == 2:
            for r in reef: r.present, r.zone = True, 'W'
        if cfg['R_late'] == 'present_only' and st['sig_up'] and any(
                b['group'] == 'sig' and not b['drift'] and not b['gone'] and b['start'] == t for b in B):
            st['sig_up'], st['sig_prog'] = False, 0   # flags must go up again for the newcomer
        held, closed = None, False
        last_hero = min(h.init for h in heroes)
        order = [(h.init, 2, h) for h in heroes] + [(last_hero, 1, tar)]
        order += [(c.init, 0, c) for c in sentries + [boarder, boss] + reef if c.present]
        order.sort(key=lambda x: (-x[0], -x[1]))
        dec = 0

        def near_winch():
            return [h for h in heroes if h.up and h.zone == 'W'] + ([tar] if tar.up and tar.zone == 'W' else [])

        def holder_target():
            h = held or st['holder']
            if h is not None and h.up and h.zone == 'W': return h
            if tar.up and tar.zone == 'W' and st['stopper']: return tar
            return None

        for _, _, c in order:
            if st['allout']: break
            if not c.present or not c.up: continue
            if c.side == 'hero':
                dec += 1
                bonus = False
                if c.kind == 'cleric' and c.hw and c.zone in ('W', 'M'):
                    tgt = tar if (not tar.up and tar.zone == 'W') else next((h for h in heroes if not h.up), None)
                    if tgt is not None:
                        tgt.heal(d(1, 4) + 3); c.hw -= 1; bonus = True
                        if tgt is tar: st['j2_blocked'] = False
                want = 'M' if (c.role == 'mast' and (not st['sig_up'] or pending_late(t))) else 'W'
                if c.zone != want:
                    if c.zone in ('W', 'M'): c.dist = 4
                    mv = 6
                    if c.dist > mv and c.kind == 'rogue' and cfg['features'] and not bonus: mv += 6; bonus = True
                    if c.dist > mv and c.kind == 'wizard' and c.misty and not bonus and t == 1: mv += 6; c.misty -= 1; bonus = True
                    if c.dist <= mv: c.zone, c.dist = want, 0
                    else:
                        c.dist -= mv; c.zone = 'S'; continue
                if c.kind == 'fighter' and c.sw and c.hp < c.maxhp / 2 and not bonus:
                    c.heal(d(1, 10) + 3); c.sw = False; bonus = True
                if c.zone == 'M':
                    if not st['sig_up']:
                        if st['sig_last'] < t - 1: st['sig_prog'] = 0
                        st['sig_prog'] += 1; st['sig_last'] = t
                        if st['sig_prog'] >= sig_need:
                            st['sig_up'] = True; st['sig_round'] = st['sig_round'] or t
                            log.append(f'  R{t}: сигнал второго приказа поднят ({c.name})')
                        continue
                    tg = next((r for r in reef if r.present and r.up and not r.fled), None)
                    if tg and not st['boss_out']: hero_hit(c, tg, False)
                    continue
                # at the winch
                if not st['stopper']:
                    need = 1 if (tar.up and tar.zone == 'W') else 2
                    if c.name == 'Руся' and not bonus: st['knocks'] += 1; bonus = True
                    if st['knocks'] < need:
                        st['knocks'] += 1
                        if st['knocks'] >= need: st['stopper'] = True; st['knocks'] = 0
                        continue
                    st['stopper'] = True; st['knocks'] = 0
                tar_will = tar.up and tar.zone == 'W'
                cur = st['holder']
                if held is None and not tar_will and not (cur is not None and cur is not c and cur.up and cur.side == 'hero' and cur.zone == 'W'):
                    cands = sorted([h for h in heroes if h.up and h.zone == 'W' and h.role != 'mast'],
                                   key=lambda h: (h is not cur, h.name != 'Прохор', h.kind != 'fighter'))
                    if cands and cands[0] is c:
                        if not tar.up and cfg['R_tarbody'] == 'drag' and st['j2_blocked']:
                            st['j2_blocked'] = False; continue   # this action drags Тар off J2
                        held = c; st['holder'] = c; continue
                if held is c: continue
                if st['holder'] is c and held is None: pass
                if st['boss_out']: continue
                foes = [f for f in sentries + [boarder, boss] if f.present and f.up and f.zone == 'W']
                reefs = [r for r in reef if r.present and r.up and not r.fled]
                if cfg['focus'] == 'boss' and boss in foes: tg = boss
                else: tg = next(iter([f for f in foes if f is boarder] + [f for f in foes if f in sentries] + [f for f in foes if f is boss] + reefs), None)
                if tg is None: continue
                adv = tg is boss and cfg['reckless']
                hero_hit(c, tg, adv)
                if c.surge and tg is boss: hero_hit(c, tg, adv); c.surge = False
                boss_check(t)
                if tg in reef and tg.hp <= tg.maxhp // 2: tg.fled = True; tg.present = False
            elif c is tar:
                if tar.zone != 'W':
                    if tar.dist <= tar_speed: tar.zone, tar.dist = 'W', 0
                    else: tar.dist -= tar_speed; continue
                if st['stopper'] and held is None:
                    held = tar; st['holder'] = tar
            elif c.side == 'foe':
                if st['boss_out']: continue
                if t == 1 and cfg['map'] and c in sentries: continue
                arriving = c.zone == 'X'
                if arriving: c.zone = 'W'
                near = near_winch()
                if st['stopper'] and not near:
                    st['stopper'] = False; closed = True
                    log.append(f'  R{t}: {c.name} закрывает стопор'); continue
                if not near: continue
                ht = holder_target()
                if c is boss or c is boarder:
                    if ht is not None and not arriving: tg = ht
                    else:
                        pool = [h for h in near if h is not ht] or ([] if arriving else near)
                        if not pool: continue
                        tg = random.choice(pool)
                    if c is boss:
                        hit = atk(5, tg.ac, cfg['reckless'])
                        if hit: tg.hurt(d(hit, 12) + 3)
                    else:
                        hit = atk(3, tg.ac)
                        if hit: tg.hurt(d(hit, 6) + 1)
                else:
                    tg = random.choice(near); hit = atk(3, tg.ac)
                    if hit: tg.hurt(d(hit, 6) + 1)
                if tg is tar and not tar.up: st['j2_blocked'] = cfg['R_tarbody'] == 'drag'
                if held is not None and not held.up:
                    log.append(f'  R{t}: держащий тормоз {held.name} упал'); held = None
            elif c.side == 'reef':
                if c.fled: continue
                if st['boss_out'] or c.hp <= c.maxhp // 2: c.fled = True; c.present = False; continue
                pool = [h for h in heroes if h.up and h.zone in ('W', 'M')] + ([tar] if tar.up and tar.zone == 'W' else [])
                pool += [f for f in sentries + [boarder, boss] if f.present and f.up and f.zone == 'W']
                if not pool: continue
                tg = random.choice(pool)
                for die in (6, 6):
                    hit = atk(3, tg.ac)
                    if hit: tg.hurt(d(hit, die) + 1)
                if tg is boss: boss_check(t)
                if tg is tar and not tar.up: st['j2_blocked'] = cfg['R_tarbody'] == 'drag'
                if held is not None and not held.up: held = None
            if not any(h.up for h in heroes) and not st['boss_out'] and not st['allout']:
                st['allout'] = t; log.append(f'  R{t}: все герои выбыли — гребцы стаскивают их в лодку')
        if st['allout'] and tar.up and tar.zone == 'W' and st['stopper'] and not closed:
            held = tar
        chain = bool(st['stopper'] and held is not None and held.up and not closed)
        if chain: st['chain_turns'].append(t)
        st['last_holder'] = held if chain else None
        st['decisions'].append(dec + len([s for s in ships if s.state == 'sea']))
        # strait turn: effects of signal / surrender, then caravan, then blockade, then water
        lag = 1 if cfg.get('fix') == 'lag' else 0
        for b in B:
            if b['gone'] or b['drift'] or t < b['start']: continue
            if b['group'] == 'sig' and st['sig_up'] and t >= st['sig_round'] + lag: b['drift'] = True
            if b['group'] == 'boss' and st['boss_out'] and t >= st['boss_out_round'] + lag:
                if not (cfg.get('fix') == 'mate' and b['kind'] == 'flag'): b['drift'] = True
        log.append(f'R{t}: цепь {"лежит" if chain else "стоит"} (держит {held.name if chain else "—"}), '
                   f'вода {water_at(t, st)}, Кречет {boss.hp if boss.present else "—"}, Тар {tar.hp}')
        caravan_move(ships, t, chain, cfg, B, st, log)
        blockade_act(B, ships, t, cfg, log)
        if all(s.state in ('passed', 'taken', 'row3') for s in ships): break
    passed = sum(1 for s in ships if s.state in ('passed', 'row3'))
    lh = st['last_holder']
    res = dict(passed=passed,
               ending='Коридор' if passed >= 4 else ('Половина каравана' if passed >= 2 else 'Пролив закрыт'),
               sig_round=st['sig_round'], boss_out_round=st['boss_out_round'],
               chain_turns=len(st['chain_turns']), first_chain=st['chain_turns'][0] if st['chain_turns'] else None,
               allout=bool(st['allout']), hero_holder=(lh is not None and lh.side == 'hero'),
               hero_downs=sum(h.downs for h in heroes), any_hero_down=any(h.downs for h in heroes),
               tar_down=tar.downs > 0, drop=st['drop_used'], rounds=t,
               decisions=statistics.mean(st['decisions']), taken=sum(1 for s in ships if s.state == 'taken'),
               boss_hp_end=boss.hp if boss.present else 67)
    if verbose:
        print('\n'.join(log)); print(res)
    return res

BASE = dict(players=6, alarm=0, inna='shown', reef='pact', book=True, map=True, mast=True,
            policy='wait', focus='boss', features=True, reckless=False, fix=None,
            R_drop='any_end', R_tarbody='share', R_late='flags_stay', R_tardash=False,
            R_aground='spent', R_reefcount='package')
TABLES = {
    'тихий (тревога 0, договор, книга)': dict(alarm=0, inna='shown', reef='pact', book=True),
    'средний (5, нейтралитет, азбука)': dict(alarm=5, inna='shown', reef='neutral', book=False),
    'шумный (8, вражда, азбука, Инне не показали)': dict(alarm=8, inna='none', reef='hostile', book=False),
}

def cell(over, runs=400, seed=7):
    cfg = dict(BASE); cfg.update(over)
    rng_state = random.getstate(); out = []
    for i in range(runs):
        random.seed(zlib.crc32(repr((seed, i, sorted(cfg.items()))).encode()))
        out.append(run(cfg))
    random.setstate(rng_state)
    return out

def summarize(out):
    n = len(out)
    pct = lambda f: 100.0 * sum(1 for o in out if f(o)) / n
    p = sorted(o['passed'] for o in out)
    br = [o['boss_out_round'] for o in out if o['boss_out_round']]
    sr = [o['sig_round'] for o in out if o['sig_round']]
    return dict(
        corr=pct(lambda o: o['ending'] == 'Коридор'), half=pct(lambda o: o['ending'] == 'Половина каравана'),
        closed=pct(lambda o: o['ending'] == 'Пролив закрыт'), five=pct(lambda o: o['passed'] == 5),
        mean=statistics.mean(p), p10=p[int(0.1 * n)], p90=p[min(n - 1, int(0.9 * n))],
        boss=pct(lambda o: o['boss_out_round']), boss_rd=statistics.mean(br) if br else float('nan'),
        sig=pct(lambda o: o['sig_round']), sig_rd=statistics.mean(sr) if sr else float('nan'),
        hero_holder=pct(lambda o: o['hero_holder']), allout=pct(lambda o: o['allout']),
        anydown=pct(lambda o: o['any_hero_down']), tar_down=pct(lambda o: o['tar_down']),
        drop=pct(lambda o: o['drop']), chain=statistics.mean(o['chain_turns'] for o in out),
        dec=statistics.mean(o['decisions'] for o in out), rounds=statistics.mean(o['rounds'] for o in out))
