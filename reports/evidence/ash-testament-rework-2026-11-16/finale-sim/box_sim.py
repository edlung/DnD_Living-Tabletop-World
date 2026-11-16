#!/usr/bin/env python3
"""Evening 8 redesign draft: «Ящик Чаши» instead of Efim on the planks.

Reuses the grid, units, movement and combat of planks_sim.py. The box is not a creature: it rides in its
carrier's cell, lies in a cell when dropped, or moves with the veteran holding it.
Draft rules modelled (coordinator 2026-11-16) and the readings tested are the fields of BoxRules.
"""
from __future__ import annotations

import statistics
from dataclasses import dataclass

import planks_sim as P
from planks_sim import BOAT, adj, cheb, d, dijkstra, pillar_cover


@dataclass
class BoxRules:
    integ: int = 12              # «целость» N
    dmg: str = "1d8+1"           # fire bolt: "1d8+1" | "1d6"
    douse: int = 2               # «Сбить пламя» +k
    grab_vs_carrier: bool = False  # «Взять» vs carrier's AC instead of 10
    platon_takes: bool = False   # Платон may take the box
    relay: bool = False          # True: a pass lets a second hero carry 3 more (box up to 6/round)
    carrier_zaslon: bool = False  # the carrier himself may take a shot at the box
    col_speed_by_gap: tuple = (4, 5, 5)
    col_schedule: tuple = (2, 3, 5)
    packet: str = "Елисей"       # who holds Efim's oilcloth packet (core hero)
    carrier: str = "Стас"
    zaslon_total: int = 99       # Заслонов за раунд на весь стол
    packet_run: bool = False     # exploit test: the packet holder runs to the goal column and waits there
    xbow_round1: bool = True     # False: crossbowmen light their bolts in round 1 and do not shoot


PACKETS = ("Анфиса", "Пелагея", "Елисей")


class BoxSim(P.Sim):
    def __init__(self, n, table, pol, rules: BoxRules, rng, foe_cells):
        rd = P.Readings(grab_then_drag_same_turn=False, hold_without_point="stay",
                        col_schedule=rules.col_schedule, col_speed_by_gap=rules.col_speed_by_gap)
        self.R = rules
        self._box_ground = None
        self.carrier = None
        super().__init__(n, table, pol, rd, rng, foe_cells)
        self.carrier = next(u for u in self.units if u.key == rules.carrier)
        # the box starts where Efim used to stand: its carrier on 2/3 (swap with whoever stands there)
        other = next((u for u in self.units if u.side == "H" and u.pos == (2, 3)), None)
        if other is not None and other is not self.carrier:
            other.pos = self.carrier.pos
        self.carrier.pos = (2, 3)
        self.integ = rules.integ
        self.box_moved = 0
        self.passed = False
        self.stats.update(burn_dmg=0, douses=0, box_grabs=0, box_taken=0, drops=0, passes=0)

    # Efim's position in the base code == the box's cell
    @property
    def efim_pos(self):
        if getattr(self, "carrier", None) is not None:
            return self.carrier.pos
        if getattr(self, "holder", None) is not None:
            return self.holder.pos
        return self._box_ground or (1, 4)

    @efim_pos.setter
    def efim_pos(self, v):
        self._box_ground = v

    def efim_standing(self):
        return True

    def occupied(self, exclude=None):
        return {u.pos for u in self.units if not u.gone and u is not exclude and not u.removed_by_column}

    def box_free(self):
        return self.holder is None

    def drop_at(self, cell):
        self.carrier = None
        self._box_ground = cell
        self.stats["drops"] += 1

    def leave(self, u):
        if self.holder is u:
            self.holder = None
            self.drop_at(u.pos)
        u.gone = True

    def damage_foe(self, u, dmg, attacker=None):
        if self.holder is u and dmg > 0 and not u.gone:
            self.holder = None
            self.drop_at(u.pos)
        super().damage_foe(u, dmg, attacker)

    def damage_hero(self, h, dmg):
        super().damage_hero(h, dmg)
        if h.down and self.carrier is h:
            self.drop_at(h.pos)

    def zaslon(self, is_grab=False):
        cell = self.efim_pos
        if sum(getattr(u, "zaslon_used", False) for u in self.units if u.side == "H") >= self.R.zaslon_total:
            return None
        cands = [h for h in self.heroes() if not h.zaslon_used and (
            (adj(h.pos, cell)) or (self.R.carrier_zaslon and h is self.carrier))]
        if not cands:
            return None
        cands.sort(key=lambda h: (-h.ac, -h.hp))
        cands[0].zaslon_used = True
        self.stats["zaslon"] += 1
        return cands[0]

    def burn(self, dmg):
        self.integ -= dmg
        self.stats["burn_dmg"] += dmg
        if self.integ <= 0:
            self.outcome = "Сгорел"

    def bolt(self):
        if self.R.dmg == "1d6":
            return d(1, 6, self.rng)
        return d(1, 8, self.rng) + 1

    def pick_target(self, h):
        fs = [f for f in self.foes() if not f.platon or f is self.holder or self.R.platon_takes]
        if not fs:
            return None
        cell = self.efim_pos

        def prio(f):
            de = cheb(f.pos, cell)
            if f is self.holder:
                return (0, 0)
            if f.kind == "vet" and de <= 8:
                return (1, de)
            if f.kind == "kondrat" and de <= 8:
                return (2, de)
            if f.kind == "xbow":
                return (3, f.hp)
            return (4, de)
        fs.sort(key=prio)
        return fs

    # ---------------- heroes
    def carry_step(self, h, budget):
        """Carrier walks east along the spine up to `budget` (difficult = 2)."""
        if budget <= 0:
            return
        foes = {f.pos for f in self.foes()}
        occ = self.occupied(exclude=h)
        dist, _ = dijkstra(h.pos, foes, budget)  # passes through allies, ends on a free cell
        best = None
        for c, dc in dist.items():
            if c in occ:
                continue
            sc = c[0] * 10 - 2 * abs(c[1] - 3)
            if c in P.DIFFICULT:
                sc -= 8
            for f in self.foes():
                if f.kind in ("vet", "kondrat") and adj(c, f.pos) and not (f.platon and not self.R.platon_takes):
                    sc -= 15
            if best is None or sc > best[0]:
                best = (sc, c)
        if best and best[1] != h.pos:
            moved = dist[best[1]]
            h.pos = best[1]
            self.box_moved += moved
            h.carried = getattr(h, "carried", 0) + moved

    def hero_turn(self, h):
        self.stats["decisions"] += 1
        h.acted = True
        rng = self.rng
        acted = False
        # cleric bonus: raise a downed hero (carrier first)
        if h.kind == "cleric" and h.hw > 0:
            downs = [x for x in self.units if x.side == "H" and x.down and not x.gone and cheb(x.pos, h.pos) <= 12]
            if downs:
                x = downs[0]
                h.hw -= 1
                x.hp = d(2, 4, rng) + 3
                x.down = False
        if self.R.packet_run and h.key == self.R.packet and h is not self.carrier:
            if h.pos[0] < self.goal:
                self.move_toward(h, [(self.goal, 4), (self.goal + 1, 4)])
            adjf = [f for f in (self.pick_target(h) or []) if adj(f.pos, h.pos)]
            if adjf:
                self.melee(h, adjf[0])
            return
        if self.carrier is None and self.holder is None:
            # box on the ground: go and pick it up
            cell = self._box_ground
            if cheb(h.pos, cell) <= 7:
                if cheb(h.pos, cell) > 1:
                    self.move_toward(h, [cell])
                if cheb(h.pos, cell) <= 1:
                    self.carrier = h
                    if cell not in self.occupied(exclude=h):
                        h.pos = cell
                    return
        if h is self.carrier:
            cap = max(0, 3 - (getattr(h, "carried", 0) if self.R.relay else self.box_moved))
            self.carry_step(h, cap)
            # relay pass (free, once a round) to an adjacent hero who has not acted, further east
            if self.R.relay and not self.passed:
                nxt = [x for x in self.heroes() if x is not h and adj(x.pos, h.pos) and not getattr(x, "acted", False)]
                if nxt:
                    self.carrier = max(nxt, key=lambda x: x.pos[0])
                    self.passed = True
                    self.stats["passes"] += 1
            if self.integ <= self.R.integ - self.R.douse and not any(adj(f.pos, h.pos) for f in self.foes()):
                self.douse()
                return
            adjf = [f for f in (self.pick_target(h) or []) if adj(f.pos, h.pos)]
            if adjf:
                self.melee(h, adjf[0])
            elif self.integ < self.R.integ:
                self.douse()
            return
        if self.holder is not None:
            if adj(h.pos, self.holder.pos):
                self.melee(h, self.holder)
                return
            self.move_toward(h, [self.holder.pos])
            if self.holder is not None and adj(h.pos, self.holder.pos):
                self.melee(h, self.holder)
                return
            if self.holder is None and self._box_ground and cheb(h.pos, self._box_ground) <= 1 and self.carrier is None:
                self.carrier = h
                return
        # keep clear of the column: anyone within 5 columns of its edge steps east first
        if self.col_round is not None and self.round >= self.col_round and h.pos[0] <= self.col_front() + 5:
            self.move_toward(h, [(min(24, max(self.efim_pos[0], self.col_front() + 7)), h.pos[1])])
        if self.receipt and self.receipt_read_round is None and h.role != "escort" and any(
                cheb(h.pos, v.pos) <= 6 for v in self.vets()) and any(not v.platon for v in self.vets()):
            self.receipt_read_round = self.round
            self.stats["receipt_read"] = True
            return
        if h.role == "escort":
            # stay next to where the box will be this round
            cell = self.efim_pos
            ahead = 0
            if self.carrier is not None and not getattr(self.carrier, "acted", False):
                ahead = max(0, 3 - self.box_moved)
            pc = (min(24, cell[0] + ahead), 3 if ahead else cell[1])
            tgt = [(pc[0], pc[1] + 1), (pc[0], pc[1] - 1), (pc[0] + 1, pc[1]),
                   (pc[0] + 1, pc[1] + 1), (pc[0] + 1, pc[1] - 1)]
            if h.pos not in tgt:
                self.move_toward(h, tgt)
            if adj(h.pos, self.efim_pos) and self.integ <= self.R.integ - self.R.douse:
                self.douse()
                return
            self.offense(h, moved=True)
            return
        before = h.pos
        acted = self.offense(h, moved=False)
        if not acted and h.pos == before:
            # nothing to hit: walk with the box (one or two columns behind or beside it)
            cell = self.efim_pos
            self.move_toward(h, [(max(1, cell[0] - 1), r) for r in (2, 4, 5)])

    def douse(self):
        self.integ = min(self.R.integ, self.integ + self.R.douse)
        self.stats["douses"] += 1

    # ---------------- foes
    def capture_point(self, holder):
        pts = []
        if self.boat:
            pts.append(BOAT)
        if self.column_here():
            pts += [(self.col_front(), r) for r in range(1, 7)]
        return pts

    def drag(self, v, budget=3):
        pts = self.capture_point(v)
        if not pts:
            return False
        spent = 0
        while spent < budget:
            blocked = self.occupied(exclude=v)
            best = None
            for n in P.nbrs(v.pos):
                if n in blocked:
                    continue
                c = P.cost(n)
                if spent + c > budget:
                    continue
                sc = min(cheb(n, p) for p in pts)
                if sc < min(cheb(v.pos, p) for p in pts) and (best is None or sc < best[0]):
                    best = (sc, n, c)
            if not best:
                break
            v.pos = best[1]
            spent += best[2]
            if self.boat and v.pos == BOAT:
                self.outcome = "У Румы"
                self.stats["taken_by"] = "boat"
                return True
        return True

    def vet_turn(self, v):
        self.stats["decisions"] += 1
        rng = self.rng
        if self.holder is v:
            self.drag(v)
            return
        if v.platon and not self.R.platon_takes:
            if not adj(v.pos, self.efim_pos):
                self.move_toward(v, [self.efim_pos])
            hs = [h for h in self.heroes() if h.hit_platon and adj(h.pos, v.pos)]
            if hs:
                r = self.attack(3, hs[0].ac, rng)
                if r:
                    self.damage_hero(hs[0], d(r, 6, rng) + 1)
            return
        if self.holder is None and cheb(v.pos, self.efim_pos) > 1:
            self.move_toward(v, [self.efim_pos])
        if self.holder is None and cheb(v.pos, self.efim_pos) <= 1:
            self.stats["box_grabs"] += 1
            if self.carrier is not None and self.zaslon(is_grab=True):
                return
            ac = self.carrier.ac if (self.carrier is not None and self.R.grab_vs_carrier) else 10
            if self.attack(3, ac, rng):
                self.holder = v
                self.carrier = None
                self.stats["box_taken"] += 1
            return
        hs = [h for h in self.heroes() if adj(h.pos, v.pos)]
        if hs:
            hs.sort(key=lambda h: cheb(h.pos, self.efim_pos))
            r = self.attack(3, hs[0].ac, rng)
            if r:
                self.damage_hero(hs[0], d(r, 6, rng) + 1)

    def xbow_turn(self, x):
        self.stats["decisions"] += 1
        rng = self.rng
        blocked = self.occupied(exclude=x)
        dist, _ = dijkstra(x.pos, blocked, 6)
        cell = self.efim_pos
        best = None
        for c in dist:
            dE = cheb(c, cell)
            sc = -(100 + dE) if dE > 16 else 0
            if pillar_cover(c, cell):
                sc -= 5
            sc += min(min([cheb(c, h.pos) for h in self.heroes()] or [99]), 6) - 0.01 * dist[c]
            if best is None or sc > best[0]:
                best = (sc, c)
        x.pos = best[1]
        if cheb(x.pos, cell) > 16 or (self.round == 1 and not self.R.xbow_round1):
            return
        adv = -1 if any(adj(h.pos, x.pos) for h in self.heroes()) else 0
        if self.holder is None:
            z = self.zaslon()
            if z:
                r = self.attack(3, z.ac + (2 if pillar_cover(x.pos, z.pos) else 0), rng, adv)
                if r:
                    self.damage_hero(z, d(r, 8, rng) + 1)
            else:
                r = self.attack(3, 10 + (2 if pillar_cover(x.pos, cell) else 0), rng, adv)
                if r:
                    self.burn(self.bolt() + (self.bolt() if r == 2 else 0))
        else:
            hs = [h for h in self.heroes() if adj(h.pos, cell)]
            if hs:
                r = self.attack(3, hs[0].ac, rng, adv)
                if r:
                    self.damage_hero(hs[0], d(r, 8, rng) + 1)

    def kondrat_turn(self, k):
        self.stats["decisions"] += 1
        rng = self.rng
        if self.round == 1:
            return
        if k.hp <= 27:
            self.leave(k)
            self.kondrat_left_round = self.round
            self.stats["kondrat_left"] = True
            self.boat = False
            return
        cell = self.efim_pos
        if cheb(k.pos, cell) > 1:
            self.move_toward(k, [cell])
        hs = [h for h in self.heroes() if adj(h.pos, k.pos) and (cheb(h.pos, cell) <= 1)]
        if not hs:
            hs = [h for h in self.heroes() if adj(h.pos, k.pos)]
        if hs:
            hs.sort(key=lambda h: h.hp)
            r = self.attack(5, hs[0].ac, rng)
            if r:
                self.damage_hero(hs[0], d(r, 12, rng) + 3)

    # ---------------- round loop
    def packet_ok(self, who=None):
        p = next(u for u in self.units if u.key == (who or self.R.packet))
        if p.gone or p.down:
            return False
        return True

    def run(self, max_rounds=30):
        self.round_log = []
        while self.round < max_rounds:
            self.round += 1
            r = self.round
            self.box_moved = 0
            self.passed = False
            self.efim_dest_planned = None
            for u in self.units:
                u.zaslon_used = False
                u.sneak_used = False
                u.acted = False
                u.carried = 0
            dec0 = self.stats["decisions"]
            for u in sorted(self.units, key=lambda u: -u.init):
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
            # column
            if self.col_round is not None and r >= self.col_round:
                front = self.col_front()
                for h in self.units:
                    if h.side == "H" and not h.gone and h.pos[0] <= front:
                        h.gone = True
                        h.removed_by_column = True
                        if self.carrier is h:
                            self.carrier = None
                            self._box_ground = h.pos
                if self.efim_pos[0] <= front:
                    self.outcome = "У Румы"
                    self.stats["taken_by"] = "column"
                    return self.finish()
            # Донесли
            if self.holder is None:
                if self.efim_pos[0] >= self.goal or (not self.foes() and self.efim_pos[0] >= 12):
                    self.outcome = "Донесли"
                    return self.finish()
            self.round_log.append(self.stats["decisions"] - dec0)
            # departures
            if self.kondrat_left_round == r:
                for f in self.foes():
                    if f.kind == "xbow" or (f.kind == "vet" and not self.ruma_present()):
                        self.leave(f)
            if self.receipt_read_round == r:
                for v in self.vets():
                    self.leave(v)
            if not self.heroes():
                self.outcome = "Тупик"
                return self.finish()
        self.outcome = "Тупик"
        return self.finish()

    def finish(self):
        res = super().finish()
        if self.outcome == "Донесли":
            res["ending"] = 1
        elif self.outcome in ("У Румы", "Сгорел"):
            res["ending"] = 2 if self.packet_ok() else 3
        else:
            res["ending"] = 0
        res["integ_left"] = self.integ
        res["by_packet"] = {}
        for who in PACKETS:
            if res["ending"] in (2, 3):
                res["by_packet"][who] = 2 if self.packet_ok(who) else 3
            else:
                res["by_packet"][who] = res["ending"]
        return res


def batch(n, table, pol, rules, runs, seed, root):
    import random
    cells = P.load_foe_cells(n, root)
    return [BoxSim(n, table, pol, rules, random.Random(seed * 100003 + i), cells).run() for i in range(runs)]


def summarize(res):
    N = len(res)
    o = {k: 100 * sum(r["outcome"] == k for r in res) / N for k in ("Донесли", "У Румы", "Сгорел", "Тупик")}
    for e in (1, 2, 3):
        o[f"e{e}"] = 100 * sum(r["ending"] == e for r in res) / N
        for who in PACKETS:
            o[f"e{e}_{who}"] = 100 * sum(r["by_packet"][who] == e for r in res) / N
    rounds = sorted(r["rounds"] for r in res)
    o["r_mean"] = statistics.mean(rounds)
    o["r_p10"], o["r_p90"] = rounds[int(0.1 * (N - 1))], rounds[int(0.9 * (N - 1))]
    o["drop"] = 100 * sum(r["hero_drops"] > 0 for r in res) / N
    o["dec"] = statistics.mean(r["dec_per_round"] for r in res)
    o["taken"] = statistics.mean(r["box_taken"] for r in res)
    o["douses"] = statistics.mean(r["douses"] for r in res)
    return o
