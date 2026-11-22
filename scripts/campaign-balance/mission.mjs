import assert from 'node:assert/strict';
import { skillModifier, savingThrowModifier } from '../../packages/rules/src/index.ts';
import { distance, fight, near, standing, walk } from './tactics.mjs';

// The GM places a marker at a named edge only when the text leaves its exact cell open.
export function square(a, name) {
  if (typeof name !== 'string') return name;
  const { width: w, height: h } = a.board.battlefield;
  const named = {
    center: [w >> 1, h >> 1],
    east: [w - 1, h >> 1],
    west: [0, h >> 1],
    north: [w >> 1, 0],
    south: [w >> 1, h - 1],
  };
  const m = /^([A-Z])(\d+)$/.exec(name);
  const [x, y] = m ? [m[1].charCodeAt(0) - 65, Number(m[2]) - 1] : (named[name] ?? []);
  assert.ok(x >= 0 && x < w && y >= 0 && y < h, a.scene.key + ' ' + name);
  return { x, y };
}
export function paid(a, id) {
  return a.act({ type: 'TakeAction', combatantId: id, action: 'utilize' }, false);
}
export function check(a, id, dc, skills = ['athletics']) {
  const sheet = a.state.characterSheets.get(id);
  const abilities = skills.map((s) =>
    s === 'athletics' ? 'str' : s === 'acrobatics' ? 'dex' : 'other',
  );
  return (
    (a.scene.abilityRoll?.(a, abilities, 'check') ?? a.dice.roll(20)) +
      Math.max(...skills.map((s) => skillModifier(sheet, s))) >=
    dc
  );
}
export function save(a, id, dc, abilities) {
  a.stats.saves++;
  const sheet = a.state.characterSheets.get(id);
  return (
    (a.scene.abilityRoll?.(a, abilities, 'save') ?? a.dice.roll(20)) +
      Math.max(...abilities.map((s) => savingThrowModifier(sheet, s))) >=
    dc
  );
}
const delta = (a, id, p) => distance(a.record(id).position, p);
export const task = (at, options = {}) => ({ at, ...options });
export const carry = (at, to, options = {}) => ({ at, to, ...options });
export function mission(a, jobs, options = {}) {
  const { party, foes } = a.scene;
  const live = (ids) => ids.filter((id) => standing(a, id));
  const goals = jobs.map((j) => ({
    ...j,
    at: square(a, j.at),
    to: j.to ? square(a, j.to) : null,
    left: j.work ?? 1,
    holder: null,
    done: false,
    lost: false,
  }));
  let turnRound = 0,
    result = null;
  const assignments = new Map(),
    gone = new Set();
  function releaseDown() {
    for (const g of goals)
      if (g.holder && !standing(a, g.holder)) {
        g.at = { ...a.record(g.holder).position };
        g.holder = null;
        g.left = 1;
      }
  }
  function runner(id) {
    const held = goals.find((g) => g.holder === id);
    if (held) return held;
    if (turnRound !== a.board.round) {
      assignments.clear();
      turnRound = a.board.round;
    }
    const eligible = goals.filter((g) => !g.done && !g.lost && !g.holder);
    const pool = live(party).filter((k) => !gone.has(k) && !goals.some((g) => g.holder === k));
    for (const g of eligible.filter((g) => !Array.from(assignments.values()).includes(g))) {
      const candidates = pool.filter((k) => !assignments.has(k));
      candidates.sort((l, r) => delta(a, l, g.at) - delta(a, r, g.at) || a.hp(r) - a.hp(l));
      if (candidates.length) assignments.set(candidates[0], g);
    }
    const g = assignments.get(id);
    return g && !g.done && !g.lost && !g.holder ? g : null;
  }
  function move(id, p, reach, limit, dash) {
    const allowance = () =>
      Math.max(
        0,
        limit * (a.record(id).turn.dashFt ? 2 : 1) - a.record(id).turn.movementUsedFt / 5,
      );
    walk(a, id, p, reach, Math.floor(allowance()));
    if (
      dash &&
      !near(a, id, p, reach) &&
      standing(a, id) &&
      a.act({ type: 'TakeAction', combatantId: id, action: 'dash' }, false)
    )
      walk(a, id, p, reach, Math.floor(allowance()));
  }
  function exit(id, p) {
    const { width, height } = a.board.battlefield,
      pos = a.record(id).position;
    let dest = p;
    if (options.wideExit !== false) {
      const vertical = p.x === 0 || p.x === width - 1;
      const edge = Array.from({ length: vertical ? height : width }, (_, n) =>
        vertical ? { x: p.x, y: n } : { x: n, y: p.y },
      );
      const free = edge.filter(
        (q) =>
          !a.board.combatants.some(
            (c) =>
              c.entityId !== id &&
              a.state.entities.get(c.entityId)?.status === 'active' &&
              near(a, c.entityId, q, 0),
          ),
      );
      dest =
        free.sort(
          (l, r) => distance(pos, l) - distance(pos, r) || distance(l, p) - distance(r, p),
        )[0] ?? p;
    }
    move(id, dest, 0, options.exitLimit ?? Infinity, true);
    if (near(a, id, dest, 0)) {
      gone.add(id);
      if (gone.size < party.length)
        a.act(
          {
            type: 'RemoveCombatant',
            entityId: id,
            reason: 'Left the battlefield by the authored exit',
          },
          false,
        );
    }
  }
  function progress(id, g) {
    const carrying = g.holder === id,
      p = carrying ? g.to : g.at;
    const reach = carrying ? (g.toReach ?? 1) : (g.reach ?? 1);
    const range = carrying ? (g.speed ?? Infinity) : (options.approachLimit ?? Infinity);
    move(id, p, reach, range, (!carrying || !g.noDash) && !g.noApproachDash);
    if (!standing(a, id) || !near(a, id, p, reach)) return;
    if (g.block && live(foes).some((k) => near(a, k, p, g.blockRadius ?? 0))) {
      fight(a, id, foes, { soft: options.soft, advance: false });
      return;
    }
    if (carrying) {
      g.done = true;
      g.holder = null;
      assignments.delete(id);
      return;
    }
    if (!g.free && !paid(a, id)) return;
    if (g.dc && !check(a, id, g.dc, g.skills)) return;
    if (--g.left > 0) return;
    if (!g.to) {
      g.done = true;
      assignments.delete(id);
      return;
    }
    g.holder = id;
    move(id, g.to, g.toReach ?? 1, g.speed ?? Infinity, !g.noDash);
    if (near(a, id, g.to, g.toReach ?? 1)) {
      g.done = true;
      g.holder = null;
    }
  }
  function assess() {
    releaseDown();
    const complete = goals.filter((g) => g.done).length;
    if (result) return result;
    if (
      !options.holdOpen &&
      complete === goals.length &&
      (!options.exit ||
        gone.size === party.length ||
        (options.standingExit && gone.size && live(party).every((k) => gone.has(k))))
    )
      return options.completed?.() ?? 'win';
    if (options.stopAfter && complete >= options.stopAfter) return 'win';
    if (!live(party).length) return gone.size ? 'partial' : 'defeat';
    return null;
  }
  const api = {
    goals,
    gone,
    live,
    assignments,
    mark(v) {
      result = v;
    },
  };
  return {
    progress: api,
    soft: options.soft ?? false,
    focus: () => goals.find((g) => g.holder)?.holder,
    turn(id, side) {
      releaseDown();
      if (side === 'hostile') {
        if (options.foe?.(a, id, api)) return true;
        const valid = live(party).filter((k) => !gone.has(k));
        if (!valid.length) return true;
        const before = goals.filter((g) => g.holder).map((g) => [g, g.holder, a.hp(g.holder)]);
        fight(a, id, valid, {
          soft: options.foeSoft ?? options.soft,
          focus: goals.find((g) => g.holder)?.holder,
        });
        for (const [g, who, hp] of before)
          if (g.holder === who && a.hp(who) < hp && g.dropDC && !save(a, who, g.dropDC, ['dex'])) {
            g.at = { ...a.record(who).position };
            g.holder = null;
            g.left = 1;
          }
        return true;
      }
      if (gone.has(id)) return true;
      if (options.hero?.(a, id, api)) return true;
      const g = runner(id);
      if (g) progress(id, g);
      else if (options.exit && goals.every((g) => g.done || g.holder || g.lost))
        exit(id, square(a, options.exit));
      else fight(a, id, foes, { soft: options.soft });
      return true;
    },
    result: assess,
    endRound(r) {
      const custom = options.end?.(a, r, api);
      if (custom) return custom;
      if (options.deadline && r >= options.deadline)
        return assess() ?? (goals.some((g) => g.done) || gone.size ? 'partial' : 'missed');
      return assess();
    },
  };
}
export function defend(a, points, rounds, options = {}) {
  const places = points.map((p) => square(a, p)),
    lost = new Set(),
    { party, foes } = a.scene;
  const guards = new Map();
  const active = (ids) => ids.filter((k) => standing(a, k));
  function assign() {
    guards.clear();
    const pool = active(party);
    for (const p of places.filter((p) => !lost.has(p))) {
      pool.sort((l, r) => delta(a, l, p) - delta(a, r, p));
      if (pool.length) guards.set(pool.shift(), p);
    }
  }
  assign();
  let result = null,
    last = 0;
  return {
    soft: options.soft ?? false,
    turn(id, side) {
      if (last !== a.board.round) {
        last = a.board.round;
        assign();
      }
      if (side === 'party') {
        const p = guards.get(id);
        if (p && !near(a, id, p, options.radius ?? 1)) walk(a, id, p, options.radius ?? 1);
        fight(a, id, foes, { advance: !p, soft: options.soft });
        return true;
      }
      if (options.foe?.(a, id)) return true;
      const available = places
        .filter((p) => !lost.has(p))
        .sort((l, r) => delta(a, id, l) - delta(a, id, r));
      const p = available[0];
      if (!p) return true;
      if (!near(a, id, p, options.enemyRadius ?? 1)) walk(a, id, p, options.enemyRadius ?? 1);
      fight(a, id, party, { advance: false, soft: options.soft });
      return true;
    },
    result: () => result,
    endRound(r) {
      for (const p of places)
        if (
          active(foes).some((id) => near(a, id, p, options.enemyRadius ?? 1)) &&
          !active(party).some((id) => near(a, id, p, options.radius ?? 1))
        )
          lost.add(p);
      if (!active(foes).length || r >= rounds || lost.size === places.length)
        result = options.score
          ? options.score(lost)
          : lost.size === places.length
            ? 'missed'
            : lost.size
              ? 'partial'
              : 'win';
      return result;
    },
  };
}
