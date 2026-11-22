import {
  attackPlan,
  gapBetween,
  movePlan,
  placedOf,
  vitalsOf,
} from '../../packages/combat/src/index.ts';
import { incapacitated, speedOf } from '../../packages/combat/src/vitals.ts';
import { squaresOf } from '../../packages/rules/src/index.ts';

export const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const standing = (a, id) =>
  Boolean(a.board && a.record(id)) && a.standing(id) && !incapacitated(vitalsOf(a.state, id));
const steps = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
];
const cell = (p) => p.y * 128 + p.x;
export function walk(a, id, dest, reach = 0, limit = Infinity) {
  const board = a.board,
    mover = a.record(id),
    start = mover.position;
  if (distance(start, dest) <= reach) return false;
  const field = board.battlefield,
    blocked = new Set((field.walls ?? []).map(cell)),
    allies = new Set(),
    difficult = new Set(field.difficult.map(cell));
  for (const c of board.combatants)
    if (c.entityId !== id && a.state.entities.get(c.entityId).status === 'active') {
      const pass = c.side === mover.side || !standing(a, c.entityId);
      for (const square of squaresOf(placedOf(a.state, c)))
        (pass ? allies : blocked).add(cell(square));
    }
  const size = placedOf(a.state, mover),
    whole = squaresOf({ ...size, position: { x: 0, y: 0 } });
  const score = (p) => Math.max(0, distance(p, dest) - reach);
  const queue = [{ p: start, cost: 0, prio: score(start), prev: null }],
    seen = new Map([[cell(start), 0]]);
  let best = queue[0];
  while (queue.length) {
    const n = queue.pop();
    if (n.cost !== seen.get(cell(n.p))) continue;
    const occupied = whole.some((off) => allies.has(cell({ x: n.p.x + off.x, y: n.p.y + off.y })));
    if (
      !occupied &&
      (score(n.p) < score(best.p) || (score(n.p) === score(best.p) && n.cost < best.cost))
    )
      best = n;
    if (!occupied && score(n.p) === 0) {
      best = n;
      break;
    }
    for (const [dx, dy] of steps) {
      const q = { x: n.p.x + dx, y: n.p.y + dy };
      if (q.x < 0 || q.y < 0 || q.x >= field.width || q.y >= field.height) continue;
      if (
        whole.some(
          (off) =>
            q.x + off.x >= field.width ||
            q.y + off.y >= field.height ||
            blocked.has(cell({ x: q.x + off.x, y: q.y + off.y })),
        )
      )
        continue;
      const cost = n.cost + 1 + (allies.has(cell(q)) || difficult.has(cell(q)) ? 1 : 0);
      if (cost >= (seen.get(cell(q)) ?? Infinity)) continue;
      seen.set(cell(q), cost);
      const next = { p: q, cost, prio: cost + score(q), prev: n };
      let i = queue.length;
      while (i > 0 && queue[i - 1].prio < next.prio) i--;
      queue.splice(i, 0, next);
    }
  }
  const path = [];
  for (let n = best; n.prev; n = n.prev) path.unshift(n.p);
  const max = Math.max(
    0,
    (speedOf(vitalsOf(a.state, id)) + (mover.turn.dashFt ?? 0) - mover.turn.movementUsedFt) / 5,
  );
  path.length = Math.min(path.length, Math.floor(max), limit);
  while (path.length && !movePlan(a.state, board, mover, path).legal) path.pop();
  return path.length > 0 && a.act({ type: 'MoveCombatant', combatantId: id, path });
}

export function nearest(a, id, targets) {
  const mover = a.record(id);
  return targets
    .filter((other) => standing(a, other))
    .sort(
      (l, r) =>
        gapBetween(a.state, mover, a.record(l)) - gapBetween(a.state, mover, a.record(r)) ||
        a.hp(l) - a.hp(r),
    );
}
function cast(a, id, spellId, target, extra = {}) {
  return a.act(
    {
      type: 'CastSpell',
      combatantId: id,
      spellId,
      targetId: target,
      targetIds: [target],
      ...extra,
    },
    false,
  );
}
function helpParty(a, id, sheet) {
  const list = a.scene.party
    .filter((k) => a.state.entities.get(k).status === 'active')
    .sort((l, r) => a.hp(l) - a.hp(r));
  const may = sheet.spellcasting.flatMap((s) => s.spells);
  for (const ally of list) {
    const health = a.state.characterSheets.get(ally).hitPoints;
    if (health.current > 0 && health.current > health.max / 3) continue;
    for (const spell of ['healing-word', 'cure-wounds'])
      if (may.includes(spell) && cast(a, id, spell, ally)) return;
  }
  if (a.hp(id) < sheet.hitPoints.max * 0.65 && sheet.classes.some((c) => c.classId === 'fighter'))
    a.act({ type: 'UseFeature', characterId: id, feature: 'second-wind' }, false);
}
export function support(a, id) {
  const sheet = a.state.characterSheets.get(id);
  if (sheet) helpParty(a, id, sheet);
}
function spells(a, id, targets) {
  const v = vitalsOf(a.state, id),
    list =
      v.kind === 'character'
        ? v.sheet.spellcasting.flatMap((s) => s.spells)
        : v.block.spells.map((s) => s.spellId);
  if (!list.length && !v.block?.saveActions?.length) return false;
  for (const target of targets) {
    const point = a.record(target).position;
    for (const action of v.block?.saveActions ?? [])
      if (
        a.act(
          {
            type: 'UseCreatureAction',
            combatantId: id,
            actionId: action.actionId,
            targetId: target,
            point,
          },
          false,
        )
      )
        return true;
    if (list.includes('fireball')) {
      const cluster = targets.filter((k) => distance(a.record(k).position, point) <= 4);
      if (
        cluster.length >= 2 &&
        !a.board.combatants.some(
          (c) =>
            c.side === a.record(id).side &&
            standing(a, c.entityId) &&
            distance(c.position, point) <= 4,
        ) &&
        a.act({ type: 'CastSpell', combatantId: id, spellId: 'fireball', point }, false)
      )
        return true;
    }
    const priority =
      v.kind === 'creature'
        ? list
        : [
            'scorching-ray',
            'magic-missile',
            'guiding-bolt',
            'fire-bolt',
            'sacred-flame',
            'ray-of-frost',
          ];
    for (const spell of priority)
      if (spell !== 'fireball' && spell !== 'counterspell' && list.includes(spell)) {
        const count = ['magic-missile', 'scorching-ray'].includes(spell) ? 3 : 1;
        if (cast(a, id, spell, target, { targetIds: Array(count).fill(target) })) return true;
      }
  }
  return false;
}
function strike(a, id, targets, soft) {
  const v = vitalsOf(a.state, id);
  const weapons =
    v.kind === 'character'
      ? [...v.sheet.weapons, 'unarmed-strike']
      : v.block.attacks.map((t) => t.attackId);
  for (const target of targets) {
    let best = null;
    for (const weapon of weapons) {
      const plan = attackPlan(a.state, a.board, id, weapon, target);
      if (!plan.legal || (soft && !plan.melee)) continue;
      const { damage, bonus } = plan.weapon;
      const score =
        ((damage.count * (damage.sides + 1)) / 2 + damage.bonus + bonus * 0.45) *
        (plan.disadvantage ? 0.7 : 1);
      if (!best || score > best.score) best = { weapon, score };
    }
    if (best)
      return a.act({
        type: 'Attack',
        combatantId: id,
        attackId: best.weapon,
        targetId: target,
        ...(soft ? { knockOut: true } : {}),
      });
  }
  return false;
}
export function fight(a, id, enemies, { soft = false, focus, advance = true } = {}) {
  const targets = () => {
    const nearby =
      a.scene.stores?.['запас глубины'] === 0 && a.scene.party.includes(id)
        ? enemies.filter(
            (k) => standing(a, k) && distance(a.record(id).position, a.record(k).position) <= 2,
          )
        : enemies;
    const ranked = nearest(a, id, nearby);
    if (focus && ranked.includes(focus)) return [focus, ...ranked.filter((x) => x !== focus)];
    return ranked;
  };
  let list = targets();
  if (!list.length) return;
  let spent = (!soft && spells(a, id, list)) || strike(a, id, list, soft);
  if (!spent && advance) {
    const target = a.record(list[0]),
      mover = a.record(id);
    const touching = squaresOf(placedOf(a.state, target)).sort(
      (p, q) => distance(p, mover.position) - distance(q, mover.position),
    )[0];
    walk(a, id, touching, 1);
    if (!standing(a, id)) return;
    list = targets();
    spent = (!soft && spells(a, id, list)) || strike(a, id, list, soft);
    if (
      !spent &&
      list.length &&
      a.act({ type: 'TakeAction', action: 'dash', combatantId: id }, false)
    )
      walk(a, id, touching, 1);
  }
  if (spent && standing(a, id)) {
    for (let n = 0; n < 7 && a.board && a.record(id)?.turn.attacksRemaining > 0; n++)
      if (!strike(a, id, targets(), soft)) break;
  }
}
export function near(a, id, p, r = 1) {
  return squaresOf(placedOf(a.state, a.record(id))).some((c) => distance(c, p) <= r);
}
