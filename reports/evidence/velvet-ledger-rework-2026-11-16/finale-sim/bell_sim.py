#!/usr/bin/env python3
"""Monte-Carlo simulator of «последний колокол» (velvet-ledger, evening 8).

Built only from the campaign text: sessions-4.json (evening 7 dmNote/consequences, evening 8 dmNote and
scenes), handouts.json (bell-rules, bell-card, exchange-board, floor-rules), world.json (endings,
scaling), cast hero sheets in package.json. Ambiguities are flags (see AMBIGUITIES); every default is the
reading closest to the round-1 decision list. Run: python3 bell_sim.py [N] > results.txt
"""
import random, sys, statistics
from collections import Counter

# ---------- heroes (package.json sheets; Арсений = cleric, Ева = wizard as on players.html) ----------
ABIL = {'fighter': dict(str=16, dex=12, int=10, wis=12, cha=10),
        'rogue': dict(str=10, dex=16, int=14, wis=12, cha=12),
        'cleric': dict(str=12, dex=12, int=10, wis=16, cha=14),
        'wizard': dict(str=8, dex=14, int=16, wis=12, cha=12)}
PROF = {'fighter': ({'athletics'}, set()), 'rogue': ({'investigation', 'stealth'}, {'investigation', 'stealth'}),
        'cleric': ({'insight', 'persuasion'}, set()), 'wizard': ({'investigation', 'arcana'}, set())}
HERO = {'Ольга': 'fighter', 'Ян': 'rogue', 'Агния': 'cleric', 'Павел': 'wizard', 'Ульяна': 'fighter',
        'Даниил': 'rogue', 'Арсений': 'cleric', 'Ева': 'wizard'}
SKILL_AB = dict(persuasion='cha', deception='cha', performance='cha', intimidation='cha', insight='wis',
                investigation='int', athletics='str')

def bonus(hero, skill):
    c = HERO[hero]; m = (ABIL[c][SKILL_AB[skill]] - 10) // 2
    prof, exp = PROF[c]
    return m + (2 if skill in prof else 0) + (2 if skill in exp else 0)

DEAL = ('persuasion', 'insight', 'investigation', 'deception')
RUMOR = ('persuasion', 'performance', 'intimidation')
SCREEN = ('persuasion', 'intimidation', 'athletics')
GUARD = ('athletics', 'insight')

# seats per stand (scene 1 failForward / world.scaling: 7 → third seat usually at Касса)
SEATS = {6: dict(cash=['Агния', 'Даниил'], book=['Ян', 'Ольга'], floor=['Ульяна', 'Павел']),
         7: dict(cash=['Агния', 'Даниил', 'Арсений'], book=['Ян', 'Ольга'], floor=['Ульяна', 'Павел']),
         8: dict(cash=['Агния', 'Даниил', 'Арсений'], book=['Ян', 'Ольга'], floor=['Ульяна', 'Павел', 'Ева'])}

def p_check(seats, skills, dc, helpers_extra=0):
    """Probability a stand passes: best seat rolls, 2nd seat = advantage, 3rd/4th = +1/+2."""
    if not seats: return 0.0
    b = max(bonus(h, s) for h in seats for s in skills)
    n = len(seats) + helpers_extra
    b += min(2, max(0, n - 2))
    need = max(2, min(20, dc - b))       # nat 1 always fails here for simplicity
    p1 = (21 - need) / 20
    return 1 - (1 - p1) ** 2 if n >= 2 else p1

# ---------- ambiguities (default reading first) ----------
AMB = dict(
    screen_vs_hand_auto=False,   # A1 bell-rules «Без броска мимо: … Заслон» vs «СЛ 12 против Руки» (default DC 12)
    hand_voids_book_now=True,    # A2 «стойка Книги молчит в ударах 4–5» (Book loses stroke 4/10 too) vs order Книга→…→ход Дома
    askar_uses_limit=False,      # A3 Аскар's free Слух counts against Слух/Шёпот 5
    torn_paper_releases=False,   # A4 after «Порвать бумагу» the hooked judge still cancels «любой»
    refut_counts_same_stroke=True,  # A5 a line read in stroke 5 already makes Опровержение +2
    morning='beru',              # A6 morning answer of the table: 'beru' (беру 3), 'hold', 'silent'
    reseat=True,                 # A7 «Пересесть можно на любом ударе»: idle seats help Касса
    no_key_hand_is_surcharge=True,  # A8 bell held by a sold judge at stroke 10: «Ключа нет» → Надбавка +3
    # policy / what-if knobs (not readings of the text)
    naive=False,                 # reactive table: spends cancels on the first chance, reads lines in list order
    deal_limit=7, deal_gain=3, deal_dc=13,   # «Сделка — СЛ 13, К +3 (7)»; changed only for fix candidates
    nadb_plus=0,                 # what-if: every Надбавка of the House +n
    olga_carries=False,
    # tuning levers (defaults = campaign text as of 2026-11-16)
    line_kd=1, rumor_kd=2, whisper_kd=1, kd_floor=1, short_cap=3,
    skup_plus=0, opr_plus=0, otz_plus=0, izd_plus=0, nadb_list=None,   # nadb_list: amounts for strokes 1,3,6,9
    sold_returns=False,          # sold judge returns a seized bell at stroke 12 like the others          # A9 Ольга's «следующая Рука мимо» survives a Рука already stopped by Заслон/ally
    d_shift=0,                   # added to the starting Долг (gap sweep)
)

LINE_CASH = {'Агния': 2, 'Ульяна': 2, 'Даниил': 1, 'Союз': 2}

class Bell:
    def __init__(self, st, size, amb, off, rng):
        self.rng, self.amb, self.off, self.size = rng, amb, off, size
        self.D, self.K, self.KD, self.A = st['D'] + amb['d_shift'], st['K'], st['KD'], st['A']
        self.pos = list(st['pos'])
        self.judge = st['judge']                      # released / hook / sold
        self.paper_torn = False; self.judge_line = False
        self.inga = st['inga']                        # ally now? 'ally' or 'after_union' or None
        self.naya, self.askar = st['naya'], st['askar']
        self.surma = st['surma']                      # 'word' / 'split' / None
        self.box = st['box']                          # out / lost
        self.key = st['key']                          # yan / sold / lost
        self.seized = set()                           # strokes when Book is silent
        self.olga_armed = False
        self.lines = [l for l in st['lines']] + (['Арсений'] if size >= 7 else []) + (['Ева'] if size >= 8 else [])
        self.read = []
        self.deals = amb['deal_limit']; self.golos = 0 if 'golos' in off else (1 if self.box == 'lost' and self.A >= 3 else
                     3 if self.A >= 9 else 2 if self.A >= 6 else 1 if self.A >= 3 else 0)
        self.rumors = 5; self.opens = 3 if st['loud'] else 2; self.screens = 3; self.zvon = 2
        self.pravo = True; self.ally_used = set(); self.molotok = False
        self.seats = {k: list(v) for k, v in SEATS[size].items()}
        self.log = Counter(); self.load = []

    def fl(self, x): return max(self.amb['kd_floor'], x)
    def cap(self, x): c = self.amb['short_cap']; return max(-c, min(c, x))

    # ----- House script (bell-card + dmNote «ДОМ сверх карты») -----
    def house(self, s):
        a = self.amb; mol = (1 if self.molotok else 0) + a['nadb_plus']
        n1, n3, n6, n9 = a['nadb_list'] or (2, 3, 3, 4)
        if s in (4, 10):
            if self.key == 'yan' and s in self.seized: return ('none', 0)   # bell already in the judge's hand
            if self.key == 'yan': return ('hand', 0)
            if self.key == 'lost' and not a['no_key_hand_is_surcharge']: return ('none', 0)
            return ('nadb', (2 if s == 4 else 3) + mol)
        return {1: ('nadb', n1 + mol), 2: ('skup', 2 + a['skup_plus']), 3: ('nadb', n3 + mol), 5: ('opr', 3 + a['opr_plus']),
                6: ('nadb', n6 + mol), 7: ('otz', (5 if self.box == 'lost' else 3) + a['otz_plus']), 8: ('skup', 3 + a['skup_plus']),
                9: ('nadb', n9 + mol), 11: ('skup', 3 + a['skup_plus']), 12: ('izd', 3 + a['izd_plus'] + self.izd_extra())}[s]

    def izd_extra(self):
        if self.judge_line: return 0
        if self.judge == 'hook' and not self.paper_torn: return 2
        return 3 if self.judge == 'sold' else 0

    # ----- valuation helpers -----
    def proj_kd(self, s, floor_uses=None):
        """Honest projection of the final Курс: all remaining Скупки/Опровержение land, the Book reads what it
        still can, and the Floor spends `floor_uses` more Слух (default: all it has) plus Аскар."""
        adds = sum(self.house(t)[1] for t in range(s, 13) if self.house(t)[0] in ('skup', 'opr'))
        book_left = (sum(1 for t in range(s, 13) if t not in self.seized) - self.zvon) if self.key == 'yan' else 0
        unread = [l for l in self.lines if l not in self.read]
        red = min(len(unread), max(0, book_left)) * self.amb['line_kd'] + ('Павел' in unread)
        if 'lines' in self.off: red = 0
        fl = (0 if 'rumor' in self.off else self.rumors) if floor_uses is None else floor_uses
        red += 0.8 * self.amb['rumor_kd'] * max(0, fl) + (self.amb['rumor_kd'] if self.askar and 'askar' not in self.ally_used and 'ally_askar' not in self.off else 0)
        return self.KD + adds - red

    def posval(self, P):
        P = self.fl(P); ent = self.pos + [self.KD] * (0 if 'open' in self.off else self.opens)
        return sum(self.cap(e - P) for e in ent)

    def kd_delta_value(self, s, d, floor_left=0):
        """Benefit of moving the final Курс by d, judged at a pessimistic (no more Floor help), a middle and an
        optimistic projection; reductions take the best case, House additions the worst case."""
        P0 = self.proj_kd(s, floor_left); Pa = self.proj_kd(s)
        vals = [self.posval(P + d) - self.posval(P) for P in (P0, (P0 + Pa) / 2, Pa)]
        return max(vals) if d < 0 else min(vals)

    def open_gain(self, s):
        if self.opens <= 0 or 'open' in self.off: return -9
        cost = 0 if self.surma == 'split' else 1
        return self.cap(self.KD - self.fl(self.proj_kd(s))) - cost

    def opening_pending(self, s):
        """Policy: shorts are opened first, while the price is high (≥ +2 net expected)."""
        return self.opens if self.open_gain(s) >= 2 else 0

    def hand_value(self):
        if self.key != 'yan' or self.olga_armed: return 0.0
        pg = self.p_guard()
        return (1 - pg) * (30 if self.judge == 'sold' else 4)   # sold judge keeps the bell: Перевёртыш lost

    def p_guard(self):
        g = [h for h in self.seats['book'] if h != 'Ян']
        return p_check(g[:1], GUARD, 10) if g else 0.0

    def move_value(self, s, t, typ, amt):
        if typ in ('nadb', 'izd', 'otz'): return amt
        if typ in ('skup', 'opr'): return -self.kd_delta_value(s, amt)
        if typ == 'hand': return self.hand_value()
        return 0

    def allies(self):
        a = {}
        if 'ally_judge' not in self.off and 'judge' not in self.ally_used:
            if self.judge == 'released' or (self.paper_torn and self.amb['torn_paper_releases']):
                a['judge'] = {'nadb', 'izd'}
            elif self.judge == 'hook': a['judge'] = {'nadb', 'izd', 'skup', 'opr', 'otz', 'hand'}
        if self.inga == 'ally' and 'ally_inga' not in self.off and 'inga' not in self.ally_used:
            a['inga'] = {'skup', 'opr', 'otz'}
        if self.naya and 'ally_naya' not in self.off and 'naya' not in self.ally_used: a['naya'] = {'hand', 'otz'}
        if self.surma == 'split' and 'ally_surma' not in self.off and 'surma' not in self.ally_used: a['surma'] = {'skup'}
        return a

    def plan(self, s):
        """Table reads the public bell-card and assigns cancels for strokes s..12 (greedy by value)."""
        if self.amb['naive']:
            ty, am = self.house(s); al = self.allies()
            c = sorted([n for n, cap in al.items() if ty in cap], key=lambda n: len(al[n]))
            if c: return {s: ('ally', c[0])}
            if ty in ('nadb', 'izd') and self.zvon and self.key == 'yan' and s not in self.seized and 'zvon' not in self.off:
                return {s: ('zvon',)}
            if ty in ('skup', 'opr', 'otz', 'hand') and self.screens and 'zaslon' not in self.off: return {s: ('zaslon',)}
            return {}
        moves = [(t,) + self.house(t) for t in range(s, 13)]
        moves = [(t, ty, am, self.move_value(s, t, ty, am)) for t, ty, am in moves]
        moves.sort(key=lambda m: -m[3])
        allies = self.allies(); slot = set(); plan = {}
        zv = self.zvon if (self.key == 'yan' and 'zvon' not in self.off) else 0
        zs = 0 if 'zaslon' in self.off else self.screens
        p14 = p_check(self.seats['floor'], SCREEN, 14); p12 = 1.0 if self.amb['screen_vs_hand_auto'] else p_check(self.seats['floor'], SCREEN, 12)
        busy = s + self.opening_pending(s)     # Floor strokes reserved for opening shorts
        for t, ty, am, v in moves:
            if v < 0.75: continue
            cands = sorted([n for n, c in allies.items() if ty in c and t not in slot], key=lambda n: len(allies[n]))
            if ty in ('nadb', 'izd') and cands and len(allies[cands[0]]) <= 2:
                plan[t] = ('ally', cands[0]); slot.add(t); del allies[cands[0]]; continue
            if ty in ('nadb', 'izd') and zv > 0 and t not in self.seized and v >= 2:
                plan[t] = ('zvon',); zv -= 1; continue
            if cands:
                plan[t] = ('ally', cands[0]); slot.add(t); del allies[cands[0]]; continue
            if ty in ('skup', 'opr', 'otz', 'hand') and zs > 0 and t >= busy and v * (p12 if ty == 'hand' else p14) >= 1.0:
                plan[t] = ('zaslon',); zs -= 1
        return plan

    def line_value(self, s, l):
        v = self.kd_delta_value(s, -1)
        if l == 'Отек': return 100
        if l == 'Ольга': v += self.hand_value() if s < 10 else 0
        elif l == 'Павел': v += self.kd_delta_value(s, -2) - self.kd_delta_value(s, -1)
        elif l == 'Левна': v += 2
        elif l == 'Судья': v += self.izd_extra()
        elif l == 'Союз': v += 2 + (3 if self.inga == 'after_union' else 0)
        else: v += LINE_CASH.get(l, 0)
        return v

    # ----- stands -----
    def roll(self, seats, skills, dc, extra=0):
        self.log['rolls'] += 1; self._rolls += 1
        return self.rng.random() < p_check(seats, skills, dc, extra)

    def book_act(self, s, plan):
        if self.key == 'yan' and s not in self.seized:
            if plan.get(s, ('',))[0] == 'zvon' and self.zvon > 0:
                self.zvon -= 1; self.log['zvon'] += 1; return 'zvon'
            if 'lines' in self.off: return None
            left = [l for l in self.lines if l not in self.read]
            if not left: return None
            l = left[0] if self.amb['naive'] else max(left, key=lambda x: self.line_value(s, x)); self.read.append(l); self.log['line'] += 1
            self.KD -= self.amb['line_kd']
            if l == 'Ольга': self.olga_armed = True
            elif l == 'Павел': self.KD -= 1
            elif l == 'Левна': self.D -= 2
            elif l == 'Судья': self.judge_line = True
            elif l == 'Союз':
                self.K += 2
                if self.inga == 'after_union': self.inga = 'ally'
            else: self.K += LINE_CASH.get(l, 0)
            self.KD = self.fl(self.KD); return 'line'
        if self.key != 'yan' and self.judge != 'sold' and self.pravo and 'Отек' not in self.read:
            self.pravo = False
            if self.roll(self.seats['book'], ('persuasion',), 15):
                self.read.append('Отек'); self.KD = self.fl(self.KD - 1); self.log['pravo_ok'] += 1
            return 'pravo'
        return None

    def floor_act(self, s, plan, typ):
        fl = self.seats['floor']
        if plan.get(s, ('',))[0] == 'zaslon' and self.screens > 0:
            self.screens -= 1; self.log['zaslon'] += 1
            if typ == 'hand' and self.amb['screen_vs_hand_auto']: return ('zaslon', True)
            ok = self.roll(fl, SCREEN, 12 if typ == 'hand' else 14)
            self.log['zaslon_ok'] += ok; return ('zaslon', ok)
        opts = []
        g = self.open_gain(s)
        if self.amb['naive'] and self.opens > 0 and 'open' not in self.off: g = 3
        if self.amb['naive'] and self.rumors > 0 and 'rumor' not in self.off and not (self.opens > 0 and 'open' not in self.off):
            opts.append((50, 'rumor'))
        if g >= 2 or (g >= 1 and (13 - s) <= self.opens + 1): opts.append((100 + g, 'open'))
        elif g >= 1: opts.append((g - 0.5, 'open'))
        if self.rumors > 0 and 'rumor' not in self.off:
            dc = 11 if len(self.read) >= 3 else 13
            p = p_check(fl, RUMOR, dc)
            vs = p * self.kd_delta_value(s, -2); vw = self.kd_delta_value(s, -1)
            if max(vs, vw) > 0.1: opts.append((vs, 'rumor') if vs >= vw else (vw, 'whisper'))
        if not opts: return (None, None)
        _, a = max(opts)
        if a == 'open':
            self.opens -= 1; self.pos.append(self.KD); self.log['open'] += 1
            if self.surma != 'split': self.K -= 1
        elif a == 'rumor':
            self.rumors -= 1; self.log['rumor'] += 1
            if self.roll(fl, RUMOR, 11 if len(self.read) >= 3 else 13):
                self.KD = self.fl(self.KD - self.amb['rumor_kd']); self.log['rumor_ok'] += 1
        else:
            self.rumors -= 1; self.KD = self.fl(self.KD - self.amb['whisper_kd']); self.log['whisper'] += 1
        return (a, None)

    def cash_act(self, s, plan, extra):
        cs = self.seats['cash']
        if self.deals > 0 and 'deal' not in self.off:
            self.deals -= 1; self.log['deal'] += 1
            if self.roll(cs, DEAL, self.amb['deal_dc'], extra): self.K += self.amb['deal_gain']; self.log['deal_ok'] += 1
            return 'deal'
        if self.golos > 0:
            self.golos -= 1; self.K += 2; self.log['golos'] += 1; return 'golos'
        izd_cancelled = plan.get(12, ('',))[0] in ('zvon', 'ally')
        unread_judge = 'Судья' in self.lines and 'Судья' not in self.read and self.key == 'yan'
        if self.judge == 'hook' and not self.paper_torn and not izd_cancelled and not (unread_judge and s < 11):
            self.paper_torn = True; self.log['tear'] += 1; return 'tear'
        if 'ponizu' in self.off: return None
        self.K += 1; self.log['ponizu'] += 1; return 'ponizu'

    # ----- one stroke -----
    def stroke(self, s, plan):
        self._rolls = 0; decisions = 0
        typ, amt = self.house(s)
        cancel = plan.get(s)
        ally = cancel[1] if cancel and cancel[0] == 'ally' else None
        hand_done = None
        floor_res = (None, None)
        if typ == 'hand' and self.amb['hand_voids_book_now']:
            floor_res = self.floor_act(s, plan, typ); decisions += 1
            hand_done = self.resolve_hand(s, ally, floor_res)
        b = self.book_act(s, plan); decisions += b is not None
        if not (typ == 'hand' and self.amb['hand_voids_book_now']):
            floor_res = self.floor_act(s, plan, typ); decisions += floor_res[0] is not None
        idle = 0
        if self.amb['reseat']:
            idle += (b is None) * len(self.seats['book']) + (floor_res[0] is None) * len(self.seats['floor'])
        c = self.cash_act(s, plan, idle); decisions += c is not None
        # free ally (not cancelling) if slot open
        if ally is None and 'ally' not in self.off:
            if self.askar and 'askar' not in self.ally_used and 'ally_askar' not in self.off and \
               (not self.amb['askar_uses_limit'] or self.rumors > 0) and not self.opening_pending(s) and self.kd_delta_value(s, -2) >= 0.5:
                self.ally_used.add('askar'); self.KD = self.fl(self.KD - self.amb['rumor_kd']); self.log['askar'] += 1; decisions += 1
                if self.amb['askar_uses_limit']: self.rumors -= 1
            elif self.surma == 'word' and 'surma' not in self.ally_used and 'ally_surma' not in self.off and self.deals > 0:
                self.ally_used.add('surma'); self.deals -= 1; self.K += self.amb['deal_gain']; self.log['surma_deal'] += 1; decisions += 1
        if ally: self.ally_used.add(ally); decisions += 1; self.log['ally_' + ally] += 1
        # House move
        if typ == 'hand':
            if hand_done is None: hand_done = self.resolve_hand(s, ally, floor_res)
            decisions += 1
        elif cancel and (cancel[0] in ('zvon', 'ally') or (cancel[0] == 'zaslon' and floor_res[1])):
            if cancel[0] == 'zvon' and b != 'zvon': self.apply(typ, amt)
            else: self.log['cancel_' + typ] += 1
        else: self.apply(typ, amt)
        self.load.append((decisions, self._rolls))

    def apply(self, typ, amt):
        if typ == 'nadb': self.D += amt
        elif typ == 'izd': self.D += 3 + self.amb['izd_plus'] + self.izd_extra()
        elif typ == 'skup': self.KD += amt
        elif typ == 'opr': self.KD += self.amb['opr_plus'] + (2 if (self.read and self.amb['refut_counts_same_stroke']) else (2 if self.read_before5 else 3))
        elif typ == 'otz': self.K -= amt
        self.KD = self.fl(self.KD)

    def resolve_hand(self, s, ally, floor_res):
        if ally in ('naya', 'judge') or (floor_res[0] == 'zaslon' and floor_res[1]):
            if not self.amb['olga_carries']: self.olga_armed = False
            return 'miss'
        if self.olga_armed:
            self.olga_armed = False; self.log['olga_miss'] += 1; return 'miss'
        g = [h for h in self.seats['book'] if h != 'Ян']
        if g and self.roll(g[:1], GUARD, 10): return 'miss'
        self.log['torn'] += 1
        if self.amb['hand_voids_book_now']: self.seized.add(s)
        if self.judge == 'sold' and self.amb['sold_returns']:
            self.seized.update(range(s + 1, 12))
        elif self.judge == 'sold':
            self.key = 'lost'; self.seized.update(range(s, 13))
        else: self.seized.add(s + 1)
        return 'torn'

    def run(self):
        a = self.amb
        if self.key == 'sold' and self.judge != 'released': self.D += 4
        if self.cut_tag: self.D += 2
        if a['morning'] == 'beru' and self.K >= 3: self.K -= 3; self.D -= 5
        elif a['morning'] == 'silent': self.D += 2
        self.molotok = self.D - self.K >= 41
        self.gap0 = self.D - self.K
        for s in range(1, 13):
            if s == 5: self.read_before5 = bool(self.read)
            self.stroke(s, self.plan(s))
        self.Kpre = self.K
        self.posgain = sum(self.cap(e - self.KD) for e in self.pos)
        self.K += self.posgain
        covered = self.K >= self.D
        flip = covered and self.key == 'yan' and 'Отек' in self.read
        return ('Перевёртыш' if flip else 'Свой порог' if covered else 'С молотка'), self.K - self.D

STARTS = {
    # evening 7 dmNote benchmarks + evening 3/4/6/7 consequences for judge/allies (see README_sim)
    'осторожный': dict(D=40, K=15, KD=6, A=10, pos=[7], judge='released', inga='ally', naya=False, askar=True,
                       surma='split', box='out', loud=False, key='yan',
                       lines=['Отек', 'Ольга', 'Агния', 'Павел', 'Ульяна', 'Даниил', 'Судья', 'Левна', 'Союз']),
    'средний': dict(D=66, K=31, KD=9, A=11, pos=[8, 8], judge='hook', inga='ally', naya=False, askar=True,
                    surma='word', box='out', loud=True, key='yan',
                    lines=['Отек', 'Ольга', 'Агния', 'Павел', 'Ульяна', 'Даниил', 'Судья', 'Левна', 'Союз']),
    'рискованный': dict(D=69, K=51, KD=9, A=13, pos=[7], judge='sold', inga='after_union', naya=False, askar=True,
                        surma='word', box='out', loud=True, key='yan',
                        lines=['Отек', 'Ольга', 'Агния', 'Павел', 'Ульяна', 'Даниил', 'Судья', 'Левна', 'Союз']),
    'небрежный': dict(D=68, K=28, KD=11, A=6, pos=[], judge='sold', inga='after_union', naya=False, askar=False,
                      surma=None, box='lost', loud=False, key='yan', morning='silent',
                      lines=['Отек', 'Агния', 'Павел', 'Левна', 'Союз']),
    'удачливый': dict(D=60, K=42, KD=9, A=13, pos=[8, 8], judge='released', inga='ally', naya=True, askar=True,
                      surma='split', box='out', loud=True, key='yan',
                      lines=['Отек', 'Ольга', 'Агния', 'Павел', 'Ульяна', 'Даниил', 'Судья', 'Левна']),
    'средний, продал колокольчик': dict(D=66, K=46, KD=9, A=11, pos=[8, 8], judge='hook', inga='ally', naya=False,
                      askar=True, surma='word', box='out', loud=True, key='sold',
                      lines=['Ольга', 'Агния', 'Павел', 'Ульяна', 'Даниил', 'Судья', 'Левна', 'Союз']),
}

def simulate(name, size, n, amb=None, off=(), seed=1, cut_tag=False):
    rng = random.Random(seed * 7919 + size)
    st = STARTS[name]; amb2 = dict(AMB, **(amb or {}))
    if 'morning' in st and not (amb and 'morning' in amb): amb2['morning'] = st['morning']
    res = Counter(); margins = []; logs = Counter(); load = []; mol = 0; gap0 = None; kd = []; pg = []
    for _ in range(n):
        b = Bell(st, size, amb2, set(off), rng); b.cut_tag = cut_tag; b.read_before5 = False
        o, m = b.run(); res[o] += 1; margins.append(m); logs.update(b.log); load += b.load; mol += b.molotok
        gap0 = b.gap0; kd.append(b.KD); pg.append((b.posgain, 3 * len(b.pos)))
    q = statistics.quantiles(margins, n=10)
    return dict(res=res, n=n, p10=q[0], p50=statistics.median(margins), p90=q[-1], logs=logs, load=load,
                molotok=mol / n, gap0=gap0, kd1=sum(k == 1 for k in kd) / n, kdmean=statistics.mean(kd),
                posgain=statistics.mean(a for a, _ in pg), posmax=statistics.mean(m for _, m in pg))

def pct(r, k): return 100.0 * r['res'][k] / r['n']

