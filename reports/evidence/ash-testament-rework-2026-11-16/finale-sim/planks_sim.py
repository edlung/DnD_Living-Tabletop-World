#!/usr/bin/env python3
"""Evening 8 ("Засада на Долгом настиле") simulator, written from the campaign TEXT.

Sources modelled: encounters.json `long-planks-ambush` (trigger/objective/tactics/scaling/terrain),
sessions-4.json evening 8 (scenes, dmNote), handouts.json `plank-card`, variants/N-players.json
(start cells, foe stat blocks). Coordinates are column/row, 1-based, row 1 = north.

Every rule that the text leaves open is a named switch in `Readings`; see results.md.
No network, stdlib only. Run: python3 planks_sim.py [runs]
"""
from __future__ import annotations

import heapq
import json
import random
import statistics
import sys
from dataclasses import dataclass, field, replace

W, H = 24, 6
PILLARS = {(7, 2), (11, 5), (15, 5), (19, 2)}
DIFFICULT = {(c, r) for c in range(4, 22) for r in (1, 6)} | {(12, 2), (12, 4)}
BOAT = (17, 1)


def cheb(a, b):
    return max(abs(a[0] - b[0]), abs(a[1] - b[1]))


def adj(a, b):
    return cheb(a, b) == 1


def inb(c):
    return 1 <= c[0] <= W and 1 <= c[1] <= H


def nbrs(c):
    for dc in (-1, 0, 1):
        for dr in (-1, 0, 1):
            if dc or dr:
                n = (c[0] + dc, c[1] + dr)
                if inb(n) and n not in PILLARS:
                    yield n


def cost(c):
    return 2 if c in DIFFICULT else 1


def dijkstra(start, blocked, budget=99):
    """Movement costs from start; blocked cells cannot be entered."""
    dist = {start: 0}
    prev = {}
    pq = [(0, start)]
    while pq:
        d, c = heapq.heappop(pq)
        if d > dist.get(c, 1e9) or d > budget:
            continue
        for n in nbrs(c):
            if n in blocked:
                continue
            nd = d + cost(n)
            if nd <= budget and nd < dist.get(n, 1e9):
                dist[n] = nd
                prev[n] = c
                heapq.heappush(pq, (nd, n))
    return dist, prev


def path_to(prev, start, goal):
    p = [goal]
    while p[-1] != start:
        p.append(prev[p[-1]])
    return p[::-1]


def pillar_cover(src, dst):
    """+2 AC if the straight line from shooter to target passes a pillar cell."""
    (x0, y0), (x1, y1) = src, dst
    n = max(abs(x1 - x0), abs(y1 - y0)) * 4
    if n == 0:
        return False
    for i in range(1, n):
        t = i / n
        c = (round(x0 + (x1 - x0) * t), round(y0 + (y1 - y0) * t))
        if c in PILLARS and c != src and c != dst:
            return True
    return False


def d(n, s, rng):
    return sum(rng.randint(1, s) for _ in range(n))


# --------------------------------------------------------------------------------------------
@dataclass
class Readings:
    grab_then_drag_same_turn: bool = True   # veteran may Взять and drag in the same turn
    hold_without_point: str = "stay"        # no boat, column not yet arrived: "stay" | "west"
    kondrat_prefers_efim: bool = True       # when allowed, Kondrat axes Efim rather than a hero
    oa_follows_restriction: bool = True     # Kondrat's reaction on Efim obeys the "no veteran within 2" rule
    led_counts_difficult: bool = True       # Efim's 4 cells: difficult = 2
    carry_fallen: bool = False              # a lying Efim may be led (dragged) 4 cells
    zaslon_cap: int = 99                    # FIX TEST: total Заслон per round for the whole table
    die_on_fall: int = 99                   # FIX TEST: Efim dies when he drops to 0 for the k-th time
    vet_hold_with_ruma: bool = False        # lever b: with Рума at the west end veterans leave only at 0 / receipt
    column_reinforce: bool = False          # lever c: at Р0/Р1 the column brings one more veteran (column 2)
    xbow_adv_alone: bool = False            # lever d: advantage on a standing Efim with no hero adjacent
    kondrat_leave_hp: int = 27              # lever e
    efim_speed: int = 4                     # lever g: cells per round for Efim (led or own step)
    col_speed: int = 0                      # lever h: column advances this many columns per round after arrival
    zaslon_vs_grab: bool = True             # lever i: False = Заслон turns attacks only, not «Взять»
    col_schedule: tuple = (2, 4, 6)         # lever s: column arrival round for Р 0 / 1 / 2
    tower_col: int = 18                     # lever f: «Дошёл» column with the tower warned
    vet_hold_with_column: bool = False      # lever b2: while the column stands, veterans do not leave at 4 HP
    col_speed_by_gap: tuple = ()            # lever h2: column speed for Р 0 / 1 / 2 (overrides col_speed)
    boat_same_turn: int = 0                 # fix test: within this many cells of 17/1 the holder drags at once


@dataclass
class Table:
    name: str
    gap: int            # Р at end of evening 7
    tower: bool         # Нелла written / mirror signal -> Дошёл from 18
    boat: bool          # boat at 17/1 (not untied)
    receipt: bool
    efim_hp: int
    own_step: bool      # «свой шаг» (branch Б) else «ведут»


@dataclass
class Policy:
    name: str = "wedge"          # wedge | ring | kondrat | ignore | blockade
    route: str = "safe"          # safe (keep >=4 rows/cols from boat) | spine (row 3)
    misty: bool = True           # wizards use Misty Step to escape melee
    read_receipt: bool = True


@dataclass
class U:
    key: str
    kind: str
    side: str
    hp: int
    maxhp: int
    ac: int
    pos: tuple
    init: float = 0
    role: str = ""
    platon: bool = False
    hw: int = 0
    ms: int = 0
    gone: bool = False      # left / fell / removed
    down: bool = False      # hero at 0
    removed_by_column: bool = False
    zaslon_used: bool = False
    hit_platon: bool = False
    sneak_used: bool = False

    @property
    def active(self):
        return not self.gone and not self.down


HERO_ORDER = ["fighter", "rogue", "cleric", "wizard", "fighter", "rogue", "cleric", "wizard"]
HERO_NAMES = ["Анфиса", "Стас", "Пелагея", "Елисей", "Роксана", "Леон", "Ада", "Осип"]
HERO_START = [(1, 3), (1, 4), (1, 2), (1, 5), (1, 1), (1, 6), (2, 3), (2, 4)]
HERO_STATS = {"fighter": (31, 11, 1), "rogue": (24, 13, 3), "cleric": (24, 11, 1), "wizard": (20, 12, 2)}
VETS = {5: 2, 6: 2, 7: 3, 8: 3}
XBOWS = {5: 2, 6: 3, 7: 3, 8: 4}


def load_foe_cells(n, root):
    v = json.load(open(f"{root}/variants/{n}-players.json"))
    enc = next(e for e in v["encounters"] if e["key"] == "long-planks-ambush")
    cells = []
    for c in enc["combatants"]:
        if c["side"] == "hostile":
            cells.append((c["entity"], (c["position"]["x"] + 1, c["position"]["y"] + 1)))
    return cells


class Sim:
    def __init__(self, n, table: Table, pol: Policy, rd: Readings, rng, foe_cells):
        self.n, self.t, self.p, self.rd, self.rng = n, table, pol, rd, rng
        self.units: list[U] = []
        for i in range(n):
            k = HERO_ORDER[i]
            hp, ac, dex = HERO_STATS[k]
            u = U(HERO_NAMES[i], k, "H", hp, hp, ac, HERO_START[i], init=rng.randint(1, 20) + dex + 0.1)
            if k == "cleric":
                u.hw = 4
            if k == "wizard":
                u.ms = 2
            self.units.append(u)
        self.assign_roles()
        nv = VETS[n] - (1 if table.gap >= 3 else 0)
        vi = xi = 0
        for ent, cell in foe_cells:
            if ent.endswith("boss"):
                self.kondrat = U("Кондрат", "kondrat", "F", 67, 67, 13, cell, init=rng.randint(1, 20) + 1)
                self.units.append(self.kondrat)
            elif vi < VETS[n]:
                vi += 1
                if vi <= nv:
                    self.units.append(U(f"Вет{vi}", "vet", "F", 9, 9, 13, cell, init=rng.randint(1, 20),
                                        platon=(vi == 1)))
            else:
                xi += 1
                self.units.append(U(f"Стр{xi}", "xbow", "F", 11, 11, 12, cell, init=rng.randint(1, 20) + 1))
        self.efim_pos = (2, 2) if n >= 7 else (2, 3)
        self.efim_hp = table.efim_hp
        self.efim_max = table.efim_hp
        self.efim_fell_round = None
        self.holder: U | None = None
        self.boat = table.boat
        self.col_round = dict(enumerate(rd.col_schedule)).get(table.gap)  # None = never
        self.ruma = table.gap == 0
        self.goal = rd.tower_col if table.tower else 20
        self.receipt = table.receipt
        self.receipt_read_round = None
        self.kondrat_left_round = None
        self.round = 0
        self.outcome = None
        self.stats = dict(hero_drops=0, zaslon=0, grabs=0, grab_success=0, releases=0, efim_falls=0,
                          kondrat_left=False, decisions=0, oa=0, misty=0, receipt_read=False,
                          efim_hits_taken=0, k_on_efim=0, k_blocked_vet=0,
                          k_blocked_platon=0, k_blocked_ruma=0)
        self.dropped = set()

    # ---------------- helpers
    def assign_roles(self):
        heroes = [u for u in self.units if u.side == "H"]
        pol = self.p.name
        for u in heroes:
            u.role = "front"
        if pol == "ring":
            for u in heroes:
                u.role = "escort"
            return
        if pol == "blockade":
            rows = [3, 4, 2, 5, 1, 6, 3, 4]
            for i, u in enumerate(heroes):
                u.role = "wall"
                u.wall_row = rows[i]
            return
        if pol == "ignore":
            return
        # printed wedge: Пелагея + Стас escort; 6+: Леон also; at 8: Ада too (spotlight: four at Efim)
        esc = {"Пелагея", "Стас"}
        if self.n >= 6:
            esc.add("Леон")
        if self.n >= 8:
            esc.add("Ада")
        for u in heroes:
            if u.key in esc:
                u.role = "escort"
            elif u.kind == "wizard" or (u.key == "Ада"):
                u.role = "back"
        if pol == "kondrat":
            for u in heroes:
                if u.role == "back":
                    u.role = "front"

    def heroes(self):
        return [u for u in self.units if u.side == "H" and u.active]

    def foes(self):
        return [u for u in self.units if u.side == "F" and not u.gone]

    def vets(self):
        return [u for u in self.foes() if u.kind == "vet"]

    def occupied(self, exclude=None):
        occ = {u.pos for u in self.units if not u.gone and u is not exclude and not u.removed_by_column}
        occ.add(self.efim_pos)
        return occ

    def col_front(self):
        if self.col_round is None or self.round < self.col_round:
            return 2
        sp = self.rd.col_speed_by_gap[self.t.gap] if self.rd.col_speed_by_gap else self.rd.col_speed
        return min(24, 2 + sp * max(0, self.round - self.col_round))

    def column_here(self):
        return self.col_round is not None and self.round > self.col_round  # present from end of arrival round

    def efim_standing(self):
        return self.efim_hp > 0

    def leave(self, u):
        u.gone = True
        if self.holder is u:
            self.holder = None
            self.stats["releases"] += 1

    def damage_foe(self, u, dmg, attacker=None):
        if u.gone:
            return
        u.hp -= dmg
        if self.holder is u and dmg > 0:
            self.holder = None
            self.stats["releases"] += 1
        if u.platon and attacker is not None:
            attacker.hit_platon = True
        if u.hp <= 0:
            self.leave(u)
        elif u.kind == "vet" and u.hp <= 4 and not (self.rd.vet_hold_with_ruma and self.ruma_present()) \
                and not (self.rd.vet_hold_with_column and self.column_here()):
            self.leave(u)
        elif u.kind == "xbow" and u.hp <= 5:
            self.leave(u)

    def damage_hero(self, h, dmg):
        h.hp -= dmg
        if h.hp <= 0:
            h.hp = 0
            h.down = True
            self.stats["hero_drops"] += 1
            self.dropped.add(h.key)

    def damage_efim(self, dmg):
        self.stats["efim_hits_taken"] += 1
        self.efim_hp = max(0, self.efim_hp - dmg)
        if self.efim_hp == 0:
            self.efim_fell_round = self.round
            self.stats["efim_falls"] += 1
            if self.stats["efim_falls"] >= self.rd.die_on_fall:
                self.efim_fell_round = -99
            if self.holder:
                pass

    def zaslon(self, is_grab=False):
        """Return an adjacent hero who takes the attack, or None."""
        cands = [h for h in self.heroes() if adj(h.pos, self.efim_pos) and not h.zaslon_used]
        if sum(u.zaslon_used for u in self.units if u.side == "H") >= self.rd.zaslon_cap:
            cands = []
        if not cands:
            return None
        cands.sort(key=lambda h: (-h.ac, -h.hp))
        h = cands[0]
        h.zaslon_used = True
        self.stats["zaslon"] += 1
        self.stats["decisions"] += 1
        return h

    def attack(self, bonus, ac, rng, adv=0):
        r1 = rng.randint(1, 20)
        if adv:
            r2 = rng.randint(1, 20)
            r1 = max(r1, r2) if adv > 0 else min(r1, r2)
        if r1 == 1:
            return 0
        if r1 == 20:
            return 2
        return 1 if r1 + bonus >= ac else 0

    # ---------------- movement
    def move_toward(self, u, targets, budget=6, avoid=frozenset()):
        """Move u to the reachable cell minimising distance to any target cell (exact cells)."""
        blocked = (self.occupied(exclude=u) | set(avoid))
        dist, prev = dijkstra(u.pos, blocked, budget)
        best = None
        for c, dc in dist.items():
            score = min(cheb(c, t) for t in targets)
            key = (score, dc)
            if best is None or key < best[0]:
                best = (key, c)
        u.pos = best[1]
        return best[0][0]

    def efim_dest(self, budget=4):
        """Where the table wants Efim this round (greedy)."""
        foe_cells = {u.pos for u in self.foes()}
        hero_cells = {u.pos for u in self.heroes()}
        dist, prev = dijkstra(self.efim_pos, foe_cells, budget)  # Efim passes through heroes
        best = None
        for c, dc in dist.items():
            if c != self.efim_pos and c in hero_cells:
                continue
            if not self.rd.led_counts_difficult and False:
                pass
            score = c[0] * 10
            if self.p.route == "safe" and self.boat:
                # keep out of a veteran's grab+3-cell drag reach of 17/1
                score -= 25 * max(0, 5 - cheb(c, BOAT))
                score -= 2 * abs(c[1] - 4)
            else:
                score -= 2 * abs(c[1] - 3)
            if c in DIFFICULT:
                score -= 8
            # do not walk into a non-Platon veteran / Kondrat
            for f in self.foes():
                if f.kind in ("vet", "kondrat") and not f.platon and adj(c, f.pos):
                    score -= 15
            if best is None or score > best[0]:
                best = (score, c)
        return best[1] if best else self.efim_pos

    # ---------------- hero turn
    def hero_turn(self, h):
        rng = self.rng
        self.stats["decisions"] += 1
        bonus_used = False
        acted = False
        # healer bonus: Efim first
        if h.kind == "cleric" and not self.efim_standing() and cheb(h.pos, self.efim_pos) <= 12:
            if h.key == "Пелагея" and adj(h.pos, self.efim_pos) and h.hw == 0:
                self.efim_hp = 1
            elif h.hw > 0:
                h.hw -= 1
                self.efim_hp = min(self.efim_max, d(2, 4, rng) + 3)
            elif h.key == "Пелагея":
                pass
            bonus_used = self.efim_standing()
        # Пелагея bonus Перевязать if adjacent and still down (after move below as well)
        # free Efim
        if self.holder and h.key in ("Стас",) and not bonus_used:
            # move adjacent to Efim then cut with стропорез (bonus)
            if not adj(h.pos, self.efim_pos):
                self.move_toward(h, [self.efim_pos])
            if adj(h.pos, self.efim_pos):
                self.holder = None
                self.stats["releases"] += 1
                bonus_used = True
        # decide movement & action by role
        role = h.role
        if role in ("front", "back") and self.p.name != "ignore" and not any(
                x.role == "escort" for x in self.heroes()):
            h.role = role = "escort"   # someone always takes over leading Efim
        led = False
        if role == "wall":
            led = self.try_lead(h) if self.efim_led == 0 else False
            if not led:
                dc = (self.efim_dest_planned or self.efim_pos)[0]
                tgt = (min(W, max(dc, self.efim_pos[0]) + 1), h.wall_row)
                if h.pos != tgt:
                    self.move_toward(h, [tgt])
            if not self.efim_standing() and adj(h.pos, self.efim_pos):
                self.efim_hp = 1
                return
            if self.holder and adj(h.pos, self.efim_pos):
                self.holder = None
                self.stats["releases"] += 1
                return
            self.offense(h, moved=True)
            return
        if role == "escort" or (self.p.name == "ignore" and not self.foes()):
            led = self.try_lead(h)
            if not led:
                # stay/get adjacent to Efim
                if not adj(h.pos, self.efim_pos):
                    self.move_toward(h, [self.efim_pos])
        # fallen Efim: Перевязать as action if still down and adjacent
        if not self.efim_standing() and adj(h.pos, self.efim_pos) and not acted:
            if h.key == "Пелагея" and not bonus_used:
                self.efim_hp = 1
                bonus_used = True
            else:
                # any hero: action, 1 hp
                self.efim_hp = 1
                acted = True
        if not self.efim_standing():
            # move toward Efim to bandage
            if not adj(h.pos, self.efim_pos):
                self.move_toward(h, [self.efim_pos])
                if adj(h.pos, self.efim_pos) and not acted:
                    self.efim_hp = 1
                    acted = True
        if self.holder and not acted:
            if adj(h.pos, self.holder.pos):
                acted = self.melee(h, self.holder)
            elif adj(h.pos, self.efim_pos):
                self.holder = None
                self.stats["releases"] += 1
                acted = True
            else:
                self.move_toward(h, [self.holder.pos, self.efim_pos])
                if adj(h.pos, self.holder.pos if self.holder else (0, 0)):
                    acted = self.melee(h, self.holder)
                elif self.holder and adj(h.pos, self.efim_pos):
                    self.holder = None
                    self.stats["releases"] += 1
                    acted = True
        # receipt
        if (not acted and self.receipt and self.p.read_receipt and self.receipt_read_round is None
                and any(cheb(h.pos, v.pos) <= 6 for v in self.vets())
                and any(not v.platon for v in self.vets()) and h.role != "escort"):
            self.receipt_read_round = self.round
            self.stats["receipt_read"] = True
            acted = True
        if not acted and h.role == "escort" and self.receipt and self.p.read_receipt \
                and self.receipt_read_round is None and any(cheb(h.pos, v.pos) <= 6 for v in self.vets()) \
                and any(not v.platon for v in self.vets()):
            self.receipt_read_round = self.round
            self.stats["receipt_read"] = True
            acted = True
        if not acted:
            acted = self.offense(h, moved=(role == "escort"))
        # cleric bonus heal on a downed hero
        if h.kind == "cleric" and not bonus_used and h.hw > 1:
            downs = [x for x in self.units if x.side == "H" and x.down and not x.gone
                     and cheb(x.pos, h.pos) <= 12]
            if downs:
                x = downs[0]
                h.hw -= 1
                x.hp = d(2, 4, rng) + 3
                x.down = False

    def try_lead(self, h):
        if self.efim_led >= self.rd.efim_speed or self.holder is not None:
            return False
        if not self.efim_standing() and not self.rd.carry_fallen:
            return False
        # must reach adjacency of Efim then walk with him
        blocked = self.occupied(exclude=h)
        dist, _ = dijkstra(h.pos, blocked, 6)
        adjcells = [c for c in dist if adj(c, self.efim_pos)] + ([h.pos] if adj(h.pos, self.efim_pos) else [])
        if not adjcells:
            return False
        c0 = min(adjcells, key=lambda c: dist.get(c, 0))
        spent = dist.get(c0, 0)
        budget = min(self.rd.efim_speed - self.efim_led, 6 - spent)
        if budget <= 0:
            return False
        old = self.efim_pos
        h.pos = c0
        dest = self.efim_dest(budget)
        if dest == old:
            return False
        blocked = {u.pos for u in self.foes()}
        ed, eprev = dijkstra(old, blocked, budget)
        if dest not in ed:
            return False
        steps = ed[dest]
        # Kondrat reaction if Efim leaves his reach
        k = self.kondrat
        if not k.gone and adj(k.pos, old) and not adj(k.pos, dest) and self.round >= 2 and not getattr(k, "react", False):
            self.kondrat_oa()
        self.efim_pos = dest
        self.efim_led += steps if self.rd.led_counts_difficult else cheb(old, dest)
        self.efim_was_led = True
        # leader ends adjacent
        rest = 6 - spent - steps
        blocked = self.occupied(exclude=h)
        dist2, _ = dijkstra(h.pos, blocked, max(rest, 0) + 2)
        cands = [c for c in dist2 if adj(c, dest)]
        if cands:
            h.pos = min(cands, key=lambda c: (dist2[c], -c[0]))
        return True

    def kondrat_oa(self):
        k = self.kondrat
        k.react = True
        if self.ruma_present():
            return
        if self.rd.oa_follows_restriction and any(cheb(v.pos, self.efim_pos) <= 2 for v in self.vets()):
            return
        if not self.efim_standing() or self.holder:
            return
        self.stats["oa"] += 1
        z = self.zaslon()
        if z:
            r = self.attack(5, z.ac, self.rng)
            if r:
                self.damage_hero(z, d(r, 12, self.rng) + 3)
        else:
            r = self.attack(5, 10, self.rng)
            if r:
                self.damage_efim(d(r, 12, self.rng) + 3)

    def melee(self, h, f):
        rng = self.rng
        if h.kind in ("fighter", "rogue"):
            bonus, dd, mod = 5, 8, 3
        else:
            bonus, dd, mod = (3, 6, 1) if h.kind == "cleric" else (1, 6, -1)
        if h.kind == "wizard":
            return self.firebolt(h, f)
        r = self.attack(bonus, f.ac, rng)
        if r:
            dmg = d(r, dd, rng) + mod
            if h.kind == "rogue" and not h.sneak_used and any(
                    x is not h and adj(x.pos, f.pos) for x in self.heroes()):
                dmg += d(2 * r, 6, rng)
                h.sneak_used = True
            self.damage_foe(f, max(1, dmg), h)
        return True

    def firebolt(self, h, f):
        adv = -1 if any(adj(x.pos, h.pos) for x in self.foes()) else 0
        r = self.attack(5, f.ac, self.rng, adv)
        if r:
            self.damage_foe(f, d(r, 10, self.rng), h)
        return True

    def pick_target(self, h):
        fs = [f for f in self.foes() if not (f.platon and self.p.name != "kondrat_all")]
        if not fs:
            return None
        def prio(f):
            # threat to Efim
            de = cheb(f.pos, self.efim_pos)
            if f is self.holder:
                return (0, 0)
            if f.kind == "vet" and de <= 8:
                return (1, de)
            if f.kind == "kondrat" and (de <= 8 or self.p.name == "kondrat"):
                return (2 if self.p.name != "kondrat" else 0, de)
            if f.kind == "xbow":
                return (3, f.hp)
            return (4, de)
        fs.sort(key=prio)
        return fs

    def offense(self, h, moved=False):
        fs = self.pick_target(h)
        if not fs:
            return False
        ranged = h.kind == "wizard" or (h.kind == "rogue" and h.role in ("escort", "back"))
        # melee if a target adjacent
        adjf = [f for f in fs if adj(f.pos, h.pos)]
        if h.kind == "wizard" or (h.role == "back"):
            if not adjf and h.role == "back":
                tgt = (max(1, min(self.efim_pos[0] - 2, 22)), self.efim_pos[1])
                if cheb(h.pos, tgt) > 1:
                    self.move_toward(h, [tgt], avoid={self.efim_dest_planned})
                adjf = [f for f in fs if adj(f.pos, h.pos)]
        if h.kind == "wizard":
            # escape melee with Misty Step (bonus) if threatened
            if adjf and self.p.misty and h.ms > 0:
                h.ms -= 1
                self.stats["misty"] += 1
                blocked = self.occupied(exclude=h)
                cells = [(c, r) for c in range(1, W + 1) for r in range(1, H + 1)
                         if (c, r) not in blocked and (c, r) not in PILLARS and cheb((c, r), h.pos) <= 6
                         and not any(adj((c, r), f.pos) for f in self.foes())]
                if cells:
                    h.pos = min(cells, key=lambda c: (abs(c[0] - self.efim_pos[0] + 2), c[1]))
            for f in fs:
                if cheb(f.pos, h.pos) <= 24:
                    return self.firebolt(h, f)
            return False
        if adjf:
            return self.melee(h, adjf[0])
        if h.kind == "rogue" and h.role != "front":
            for f in fs:
                if cheb(f.pos, h.pos) <= 16 and f.kind != "kondrat" or (f is fs[0] and cheb(f.pos, h.pos) <= 16):
                    adv = -1 if any(adj(x.pos, h.pos) for x in self.foes()) else 0
                    r = self.attack(5, f.ac + (2 if pillar_cover(h.pos, f.pos) else 0), self.rng, adv)
                    if r:
                        dmg = d(r, 6, self.rng) + 3
                        if not h.sneak_used and any(x is not h and adj(x.pos, f.pos) for x in self.heroes()) and adv == 0:
                            dmg += d(2 * r, 6, self.rng)
                            h.sneak_used = True
                        self.damage_foe(f, dmg, h)
                    return True
        if moved:
            return False
        if h.role == "back" and h.kind == "cleric":
            # stay ~3 behind Efim
            self.move_toward(h, [(max(1, self.efim_pos[0] - 2), self.efim_pos[1])])
            return False
        # front: move to engage
        tgt = fs[0]
        self.move_toward(h, [tgt.pos], avoid={self.efim_dest_planned} if self.efim_dest_planned else set())
        adjf = [f for f in fs if adj(f.pos, h.pos)]
        if adjf:
            adjf.sort(key=lambda f: fs.index(f))
            return self.melee(h, adjf[0])
        return False

    # ---------------- foe turns
    def ruma_present(self):
        return self.ruma and self.col_round is not None and self.round > self.col_round

    def capture_point(self, holder):
        pts = []
        if self.boat:
            pts.append(BOAT)
        if self.column_here() or (self.rd.hold_without_point == "west" and self.col_round is not None):
            pts += [(self.col_front(), r) for r in range(1, 7)]
        if not pts and self.rd.hold_without_point == "west":
            pts += [(2, r) for r in range(1, 7)]
        return pts

    def drag(self, v, budget=3):
        pts = self.capture_point(v)
        if not pts:
            return False
        # step-wise: holder moves toward point, Efim follows into vacated cell
        spent = 0
        while spent < budget:
            blocked = self.occupied(exclude=v)
            best = None
            for n in nbrs(v.pos):
                if n in blocked:
                    continue
                c = cost(n)
                if spent + c > budget:
                    continue
                sc = min(cheb(n, p) for p in pts)
                if sc < min(cheb(v.pos, p) for p in pts) and (best is None or sc < best[0]):
                    best = (sc, n, c)
            if not best:
                break
            old = v.pos
            v.pos = best[1]
            spent += best[2]
            self.efim_pos = old
            if self.boat and v.pos == BOAT:
                self.outcome = "Взят"
                self.stats["taken_by"] = "boat"
                return True
        return True

    def vet_turn(self, v):
        self.stats["decisions"] += 1
        rng = self.rng
        if self.holder is v:
            self.drag(v)
            return
        if v.platon:
            # walks to Efim, hits only a hero who hit him
            if not adj(v.pos, self.efim_pos):
                self.move_toward(v, [self.efim_pos])
            foes = [h for h in self.heroes() if h.hit_platon and adj(h.pos, v.pos)]
            if foes:
                r = self.attack(3, foes[0].ac, rng)
                if r:
                    self.damage_hero(foes[0], d(r, 6, rng) + 1)
            return
        if not adj(v.pos, self.efim_pos):
            dist_to = self.move_toward(v, [self.efim_pos])
        if adj(v.pos, self.efim_pos) and self.holder is None:
            self.stats["grabs"] += 1
            z = self.zaslon(is_grab=True) if self.rd.zaslon_vs_grab else None
            if z:
                return  # reading: a redirected Взять is spent on the hero with no effect
            if self.attack(3, 10, rng):
                self.holder = v
                self.stats["grab_success"] += 1
                if self.rd.grab_then_drag_same_turn or (
                        self.rd.boat_same_turn and self.boat and cheb(v.pos, BOAT) <= self.rd.boat_same_turn):
                    self.drag(v)
            return
        # path closed / not adjacent: spear the hero in the way (adjacent hero nearest to Efim)
        hs = [h for h in self.heroes() if adj(h.pos, v.pos)]
        if hs:
            hs.sort(key=lambda h: cheb(h.pos, self.efim_pos))
            h = hs[0]
            r = self.attack(3, h.ac, rng)
            if r:
                self.damage_hero(h, d(r, 6, rng) + 1)

    def xbow_turn(self, x):
        self.stats["decisions"] += 1
        rng = self.rng
        can_shoot_efim = self.efim_standing() and self.holder is None
        # reposition: within 16 of Efim, prefer no pillar cover, away from heroes
        blocked = self.occupied(exclude=x)
        dist, _ = dijkstra(x.pos, blocked, 6)
        best = None
        for c in dist:
            dE = cheb(c, self.efim_pos)
            sc = 0
            if dE > 16:
                sc -= 100 + dE
            if pillar_cover(c, self.efim_pos):
                sc -= 5
            near = min([cheb(c, h.pos) for h in self.heroes()] or [99])
            sc += min(near, 6)
            sc -= 0.01 * dist[c]
            if best is None or sc > best[0]:
                best = (sc, c)
        x.pos = best[1]
        if cheb(x.pos, self.efim_pos) > 16:
            return
        adv = -1 if any(adj(h.pos, x.pos) for h in self.heroes()) else 0
        if can_shoot_efim and self.rd.xbow_adv_alone and not any(
                adj(h.pos, self.efim_pos) for h in self.heroes()):
            adv += 1
        if can_shoot_efim:
            z = self.zaslon()
            if z:
                ac = z.ac + (2 if pillar_cover(x.pos, z.pos) else 0)
                r = self.attack(3, ac, rng, adv)
                if r:
                    self.damage_hero(z, d(r, 8, rng) + 1)
            else:
                ac = 10 + (2 if pillar_cover(x.pos, self.efim_pos) else 0)
                r = self.attack(3, ac, rng, adv)
                if r:
                    self.damage_efim(d(r, 8, rng) + 1)
        else:
            hs = [h for h in self.heroes() if adj(h.pos, self.efim_pos)]
            if hs:
                h = hs[0]
                ac = h.ac + (2 if pillar_cover(x.pos, h.pos) else 0)
                r = self.attack(3, ac, rng, adv)
                if r:
                    self.damage_hero(h, d(r, 8, rng) + 1)

    def kondrat_turn(self, k):
        self.stats["decisions"] += 1
        rng = self.rng
        if self.round == 1:
            return
        if k.hp <= self.rd.kondrat_leave_hp:
            self.leave(k)
            self.kondrat_left_round = self.round
            self.stats["kondrat_left"] = True
            if self.boat:
                self.boat = False  # he rows away in it
            return
        if not adj(k.pos, self.efim_pos):
            self.move_toward(k, [self.efim_pos])
        if adj(k.pos, self.efim_pos) and self.efim_standing() and self.holder is None:
            if any(cheb(v.pos, self.efim_pos) <= 2 for v in self.vets()):
                self.stats["k_blocked_vet"] += 1
                if any(v.platon and cheb(v.pos, self.efim_pos) <= 2 for v in self.vets()):
                    self.stats["k_blocked_platon"] += 1
            elif self.ruma_present():
                self.stats["k_blocked_ruma"] += 1
        may_efim = (adj(k.pos, self.efim_pos) and self.holder is None and self.efim_standing()
                    and not any(cheb(v.pos, self.efim_pos) <= 2 for v in self.vets())
                    and not self.ruma_present())
        heroes_adj = [h for h in self.heroes() if adj(h.pos, k.pos)
                      and (adj(h.pos, self.efim_pos) or cheb(h.pos, self.efim_pos) < cheb(k.pos, self.efim_pos))]
        if may_efim and (self.rd.kondrat_prefers_efim or not heroes_adj):
            self.stats["k_on_efim"] += 1
            z = self.zaslon()
            if z:
                r = self.attack(5, z.ac, rng)
                if r:
                    self.damage_hero(z, d(r, 12, rng) + 3)
            else:
                r = self.attack(5, 10, rng)
                if r:
                    self.damage_efim(d(r, 12, rng) + 3)
            return
        if heroes_adj:
            heroes_adj.sort(key=lambda h: h.hp)
            h = heroes_adj[0]
            r = self.attack(5, h.ac, rng)
            if r:
                self.damage_hero(h, d(r, 12, rng) + 3)

    # ---------------- round
    def run(self, max_rounds=30):
        self.round_log = []
        while self.round < max_rounds:
            self.round += 1
            r = self.round
            self.efim_led = 0
            self.efim_was_led = False
            self.kondrat.react = False
            for u in self.units:
                u.zaslon_used = False
                u.sneak_used = False
            self.efim_dest_planned = self.efim_dest(self.rd.efim_speed)
            dec0 = self.stats["decisions"]
            order = sorted(self.units, key=lambda u: -u.init)
            for u in order:
                if u.gone or u.down:
                    continue
                if u.side == "H":
                    self.hero_turn(u)
                elif u.kind == "vet":
                    self.vet_turn(u)
                elif u.kind == "xbow":
                    self.xbow_turn(u)
                else:
                    self.kondrat_turn(u)
                if self.outcome:
                    return self.finish()
            # ---- end of round, printed order
            # 1 own step
            if self.t.own_step and not self.efim_was_led and self.holder is None and self.efim_standing():
                self.own_step()
            # 2 death
            if self.efim_fell_round == -99:
                self.efim_hp = 0
            if self.efim_hp == 0 and self.efim_fell_round is not None and self.efim_fell_round < r:
                self.outcome = "Погиб"
                return self.finish()
            # 3 column
            if self.col_round is not None and r >= self.col_round:
                for h in self.units:
                    if h.side == "H" and not h.gone and h.pos[0] <= self.col_front():
                        h.gone = True
                        h.removed_by_column = True
                if (r == self.col_round and self.rd.column_reinforce and self.t.gap in (0, 1)):
                    occ = self.occupied()
                    free = [(2, rr) for rr in (3, 4, 2, 5, 1, 6) if (2, rr) not in occ]  # arrival: front = 2
                    if free:
                        self.units.append(U("ВетК", "vet", "F", 9, 9, 13, free[0],
                                            init=self.rng.randint(1, 20)))
                if self.efim_pos[0] <= self.col_front():
                    self.outcome = "Взят"
                    self.stats["taken_by"] = "column"
                    return self.finish()
            # 4 Дошёл
            if self.efim_standing() and self.holder is None:
                if self.efim_pos[0] >= self.goal:
                    self.outcome = "Дошёл"
                    self.stats["dosh_by"] = "column-goal"
                    return self.finish()
                if not self.foes() and self.efim_pos[0] >= 12:
                    self.outcome = "Дошёл"
                    self.stats["dosh_by"] = "empty-field"
                    return self.finish()
            # 5 departures
            if self.kondrat_left_round == r:
                for f in self.foes():
                    if f.kind == "xbow":
                        self.leave(f)
                    if f.kind == "vet" and not self.ruma_present():
                        self.leave(f)
            if self.receipt_read_round == r:
                for v in self.vets():
                    self.leave(v)
                self.holder = None
            self.round_log.append(self.stats["decisions"] - dec0)
            if not self.heroes() and not self.t.own_step and self.foes() == [] and self.efim_pos[0] < 12:
                self.outcome = "Тупик"
                return self.finish()
        self.outcome = "Тупик"
        return self.finish()

    def own_step(self):
        # walks east up to 4, stops next to the first foe; a hero next to him may say "стой"
        heroes_adj = [h for h in self.heroes() if adj(h.pos, self.efim_pos)]
        blocked = {u.pos for u in self.units if not u.gone}
        steps = 0
        pos = self.efim_pos
        while steps < self.rd.efim_speed:
            if any(adj(pos, f.pos) for f in self.foes()):
                break
            nxt = None
            for dr in (0, 1, -1):
                c = (pos[0] + 1, pos[1] + dr)
                if inb(c) and c not in blocked and c not in PILLARS:
                    nxt = c
                    break
            if not nxt or steps + cost(nxt) > self.rd.efim_speed:
                break
            steps += cost(nxt)
            pos = nxt
        # стой: a hero next to him stops him if he would end beside a non-Platon veteran or Kondrat
        if heroes_adj and any(adj(pos, f.pos) and not f.platon and f.kind != "xbow" for f in self.foes()):
            self.stats["decisions"] += 1
            return
        self.efim_pos = pos

    def finish(self):
        return dict(outcome=self.outcome, rounds=self.round, **self.stats,
                    dec_per_round=(statistics.mean(self.round_log) if self.round_log else 0))


# --------------------------------------------------------------------------------------------
TABLES = {
    "осторожный": Table("осторожный", gap=4, tower=True, boat=False, receipt=True, efim_hp=12, own_step=False),
    "средний": Table("средний", gap=1, tower=True, boat=True, receipt=True, efim_hp=12, own_step=False),
    "средний-Б": Table("средний-Б", gap=1, tower=True, boat=False, receipt=False, efim_hp=12, own_step=True),
    "торопливый": Table("торопливый", gap=0, tower=False, boat=True, receipt=True, efim_hp=8, own_step=False),
    "худший": Table("худший", gap=0, tower=False, boat=True, receipt=False, efim_hp=8, own_step=False),
}


def batch(n, table, pol, rd, runs, seed, root):
    cells = load_foe_cells(n, root)
    res = []
    for i in range(runs):
        rng = random.Random(seed * 100003 + i)
        res.append(Sim(n, table, pol, rd, rng, cells).run())
    return res


def summarize(res):
    N = len(res)
    out = {}
    for k in ("Дошёл", "Погиб", "Взят", "Тупик"):
        out[k] = 100 * sum(r["outcome"] == k for r in res) / N
    rounds = sorted(r["rounds"] for r in res)
    out["r_mean"] = statistics.mean(rounds)
    out["r_p10"] = rounds[int(0.1 * (N - 1))]
    out["r_p90"] = rounds[int(0.9 * (N - 1))]
    out["drop"] = 100 * sum(r["hero_drops"] > 0 for r in res) / N
    out["efim_fall"] = 100 * sum(r["efim_falls"] > 0 for r in res) / N
    out["kondrat_left"] = 100 * sum(r["kondrat_left"] for r in res) / N
    out["boat"] = 100 * sum(r.get("taken_by") == "boat" for r in res) / N
    out["colT"] = 100 * sum(r.get("taken_by") == "column" for r in res) / N
    out["empty"] = 100 * sum(r.get("dosh_by") == "empty-field" for r in res) / N
    out["dec"] = statistics.mean(r["dec_per_round"] for r in res)
    out["zaslon"] = statistics.mean(r["zaslon"] / r["rounds"] for r in res)
    out["receipt"] = 100 * sum(r["receipt_read"] for r in res) / N
    return out


def fmt(o):
    return (f"{o['Дошёл']:5.1f} | {o['Погиб']:5.1f} | {o['Взят']:5.1f} | {o['Тупик']:4.1f} | "
            f"{o['r_mean']:4.1f} ({o['r_p10']}–{o['r_p90']}) | {o['drop']:5.1f} | {o['efim_fall']:5.1f} | "
            f"{o['kondrat_left']:5.1f} | {o['boat']:4.1f}/{o['colT']:4.1f} | {o['empty']:5.1f} | {o['dec']:4.1f}")


HEAD = ("| стол | N | Дошёл % | Погиб % | Взят % | тупик % | раунды ср. (p10–p90) | герой падал % | "
        "Ефим падал % | Кондрат ушёл % | Взят лодкой/колонной % | Дошёл «пустым полем» % | решений/раунд |\n"
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|")


def row(label, n, o):
    return f"| {label} | {n} | " + fmt(o).replace(" | ", " | ") + " |"


if __name__ == "__main__":
    runs = int(sys.argv[1]) if len(sys.argv) > 1 else 400
    root = sys.argv[2] if len(sys.argv) > 2 else "campaigns/collection-2026/ash-testament"
    out = []
    base_rd = Readings()
    base_pol = Policy()
    out.append("## Main grid (reading A, printed wedge, safe route)\n")
    out.append(HEAD)
    seed = 1
    main = {}
    for tname, t in TABLES.items():
        for n in (5, 6, 7, 8):
            o = summarize(batch(n, t, base_pol, base_rd, runs, seed, root))
            seed += 1
            main[(tname, n)] = o
            out.append(row(tname, n, o))
    print("\n".join(out))
    json.dump({f"{k[0]}|{k[1]}": v for k, v in main.items()},
              open(sys.argv[3] if len(sys.argv) > 3 else "/dev/null", "w"), ensure_ascii=False, indent=1)
