import { attackRoll, rollDamage } from '../../packages/rules/src/index.ts';
import { weaponOf } from '../../packages/combat/src/weapon-view.ts';
import { vitalsOf } from '../../packages/combat/src/index.ts';
import { check, paid, save, square } from './mission.mjs';
import { distance, fight, near, nearest, standing, walk } from './tactics.mjs';

const living = (a, ids) => ids.filter((id) => standing(a, id));
function put(a, id, x, y) {
  const field = a.board.battlefield;
  if (x < 0 || y < 0 || x >= field.width || y >= field.height) return false;
  return a.act(
    {
      type: 'PlaceCombatant',
      combatantId: id,
      position: { x, y },
      reason: 'Printed scenario movement',
    },
    false,
  );
}
function injury(a, id, n, type = 'bludgeoning') {
  if (n > 0)
    a.act({
      type: 'AdjustHitPoints',
      targetId: id,
      change: 'damage',
      amount: n,
      damageType: type,
      reason: 'Printed scenario damage',
    });
}
function blow(a, id, target, { bonus, count, sides, flat, ac, disadvantage = false }) {
  const atk = attackRoll(a.dice, { modifier: bonus, target: ac, disadvantage });
  a.stats.attacks++;
  if (atk.success && target)
    injury(a, target, rollDamage(a.dice, count, sides, flat, atk.critical).total);
  return atk.success;
}
function aim(a, id, ac, disadvantage = false, ability) {
  if (!paid(a, id)) return false;
  const sheet = a.state.characterSheets.get(id);
  const available = sheet.weapons
    .map((w) => weaponOf(a.state, vitalsOf(a.state, id), w, 5))
    .filter((w) => typeof w === 'object');
  const bonus = ability
    ? 2 + Math.floor((sheet.abilities[ability] - 10) / 2)
    : Math.max(0, ...available.map((w) => w.bonus));
  return blow(a, id, null, { bonus, ac, disadvantage });
}
function stair(a) {
  const { party } = a.scene,
    exits = new Set(),
    holders = new Map();
  const ankle = square(a, 'south');
  return {
    turn(id, side) {
      if (side === 'hostile') {
        const target = nearest(
          a,
          id,
          party.filter((k) => !exits.has(k) && ![...holders.values()].includes(k)),
        )[0];
        if (target) {
          walk(a, id, a.record(target).position, 1);
          if (near(a, id, a.record(target).position) && paid(a, id)) holders.set(id, target);
        }
        return true;
      }
      if (exits.has(id)) return true;
      const captor = [...holders].find(([, k]) => k === id)?.[0];
      if (captor && standing(a, captor)) {
        if (!paid(a, id) || !check(a, id, 12, ['athletics', 'acrobatics'])) return true;
        holders.delete(captor);
      }
      const dest = { x: a.record(id).position.x, y: ankle.y };
      walk(a, id, dest);
      if (
        !near(a, id, dest, 0) &&
        a.act({ type: 'TakeAction', combatantId: id, action: 'dash' }, false)
      )
        walk(a, id, dest);
      if (a.board.round % 3 === 0 && a.record(id).position.y === 17) {
        exits.add(id);
        if (exits.size < party.length)
          a.act(
            {
              type: 'RemoveCombatant',
              entityId: id,
              reason: 'Left the battlefield by the authored exit',
            },
            false,
          );
      }
      return true;
    },
    result: () => (exits.size === party.length ? 'win' : null),
    endRound(r) {
      return r === 6
        ? exits.size === party.length
          ? 'win'
          : exits.size
            ? 'partial'
            : 'missed'
        : null;
    },
  };
}
function hull(a) {
  const { party, foes } = a.scene,
    exited = new Set(),
    captured = new Set();
  const hatch = square(a, 'L3');
  const air = a.scene.stores ? (a.scene.stores['комплект полных баллонов'] ? 8 : 4) : Infinity;
  const escorted = new Set(),
    escorts = party.slice(0, 3);
  const companionAir = (id) =>
    4 + (id === escorts[0] && a.scene.stores?.['запасной баллон'] ? 3 : 0);
  let opens = Infinity;
  return {
    turn(id, side) {
      const r = a.board.round;
      if (side === 'hostile') {
        if (id === foes.at(-1) && r === 1) return true;
        const targets = nearest(
          a,
          id,
          party.filter((k) => !exited.has(k) && !captured.has(k)),
        );
        const target = targets[0];
        if (!target) return true;
        const before = a.hp(target);
        if (id === foes.at(-1)) {
          if (a.hp(id) <= 26) return true;
          if (distance(a.record(id).position, a.record(target).position) <= 18)
            blow(a, id, target, {
              bonus: 5,
              count: 1,
              sides: 10,
              flat: 3,
              ac: a.state.characterSheets.get(target).armorClass,
              disadvantage: distance(a.record(id).position, a.record(target).position) > 6,
            });
        } else if (near(a, id, a.record(target).position))
          fight(a, id, [target], { advance: false });
        else
          walk(
            a,
            id,
            { x: Math.max(6, a.record(target).position.x), y: a.record(target).position.y },
            1,
          );
        if (a.hp(target) < before && !save(a, target, 12, ['dex'])) {
          const p = a.record(target).position;
          if (p.y + 2 >= 6) captured.add(target);
          else put(a, target, p.x, p.y + 2);
        }
        return true;
      }
      if (exited.has(id) || captured.has(id)) return true;
      const p = a.record(id).position,
        dest = { x: hatch.x, y: p.y > 2 ? 3 : 2 };
      const budget = r > air ? 2 : 3;
      walk(a, id, dest, 0, budget);
      if (near(a, id, dest) && opens === Infinity && paid(a, id)) opens = r + 1;
      if (
        !near(a, id, dest, 0) &&
        a.act({ type: 'TakeAction', combatantId: id, action: 'dash' }, false)
      )
        walk(a, id, dest, 0, 1);
      if (
        near(a, id, dest, 0) &&
        opens <= r &&
        (distance(p, dest) < budget ||
          a.act({ type: 'TakeAction', combatantId: id, action: 'dash' }, false))
      ) {
        exited.add(id);
        if (escorts.includes(id) && r <= companionAir(id) + 1) escorted.add(id);
        a.objectiveDetails = { crewOnBoard: exited.size, companionsOnBoard: escorted.size, air };
        if (exited.size + captured.size < party.length)
          a.act(
            {
              type: 'RemoveCombatant',
              entityId: id,
              reason: 'Left the battlefield by the authored exit',
            },
            false,
          );
      }
      return true;
    },
    result: () =>
      exited.size + captured.size === party.length
        ? exited.size === party.length
          ? 'win'
          : exited.size
            ? 'partial'
            : 'missed'
        : null,
    endRound(r) {
      if (r >= air + 1) for (const id of party) if (!exited.has(id)) captured.add(id);
      return r >= 6 || exited.size + captured.size >= party.length
        ? exited.size === party.length
          ? 'win'
          : exited.size
            ? 'partial'
            : 'missed'
        : null;
    },
  };
}
function mountain(a) {
  const { party, foes } = a.scene,
    boss = foes[0],
    red = square(a, 'D1'),
    silver = square(a, 'T6');
  const flags = new Map(),
    signallers = [...party].sort(
      (l, r) => distance(a.record(l).position, red) - distance(a.record(r).position, red),
    );
  const redId = signallers.shift(),
    silverId = signallers.sort(
      (l, r) => distance(a.record(l).position, silver) - distance(a.record(r).position, silver),
    )[0];
  let steps = 0,
    knee = false,
    lastPush = 0,
    repeatRed = party.length === 3 ? 2 : 1,
    repeatSilver = repeatRed;
  return {
    turn(id, side) {
      if (side === 'hostile') {
        if (knee) {
          knee = false;
          return true;
        }
        const old = a.record(id).position;
        const x = Math.min(old.x + 8, 10);
        for (let next = x; next > old.x; next--) if (put(a, id, next, 2)) break;
        fight(a, id, party, { advance: false });
        return true;
      }
      if (id === redId || id === silverId) {
        const goal = id === redId ? red : silver;
        walk(a, id, goal);
        if (near(a, id, goal, 0) && paid(a, id)) flags.set(id, a.hp(id));
      } else {
        const p = a.record(boss).position;
        walk(a, id, p, 1);
        const range = distance(a.record(id).position, p);
        if (
          range <= 1 ||
          a.state.characterSheets
            .get(id)
            .weapons.some((w) => /bow|crossbow|handaxe|javelin/.test(w))
        ) {
          if (aim(a, id, 13, range > 1) && lastPush !== a.board.round) {
            lastPush = a.board.round;
            knee = true;
            put(a, boss, Math.max(0, p.x - 3), p.y);
          }
        }
      }
      return true;
    },
    endRound(r) {
      const redOK = flags.has(redId) && (a.hp(redId) >= flags.get(redId) || repeatRed-- > 0);
      const silverOK =
        flags.has(silverId) && (a.hp(silverId) >= flags.get(silverId) || repeatSilver-- > 0);
      if (redOK && silverOK && a.record(boss).position.x + 1 < 10) steps++;
      if (!redOK && !silverOK) knee = true;
      flags.clear();
      return steps >= 4 ? 'win' : r === 6 ? (steps ? 'partial' : 'missed') : null;
    },
  };
}
function nest(a) {
  const { party, foes } = a.scene,
    boss = foes[0];
  const needed = party.length <= 4 ? 3 : 4,
    maxCracks = party.length <= 4 ? 1 : 2;
  let cracks = 0,
    opened = false,
    perWindow = 0;
  const roots = new Set(),
    struck = new Set();
  return {
    turn(id, side) {
      if (side === 'hostile') {
        roots.clear();
        struck.clear();
        perWindow = 0;
        const nearBoss = nearest(a, id, party),
          defenders = nearBoss.filter((k) => near(a, k, a.record(id).position, 2));
        if (defenders.length < 2) walk(a, id, square(a, 'north'), 1, 6);
        const target = nearest(a, id, party)[0];
        if (!target) return true;
        // The party presents the warm bone at the mouth once to open the bowl.
        const fed = a.board.round === 2 && near(a, target, a.record(id).position, 2);
        opened = fed;
        if (!fed && near(a, target, a.record(id).position, 2)) {
          const before = a.hp(target);
          fight(a, id, [target], { advance: false });
          opened = a.hp(target) < before;
        }
        for (const k of nearest(a, id, party)
          .filter((k) => near(a, k, a.record(id).position, 2))
          .slice(0, party.length === 3 ? 1 : 2))
          roots.add(k);
        return true;
      }
      const p = a.record(boss).position;
      if (!roots.has(id)) walk(a, id, p, 1);
      const melee = near(a, id, p, 2);
      if (
        opened &&
        perWindow < maxCracks &&
        !struck.has(id) &&
        (melee || a.state.characterSheets.get(id).weapons.some((w) => /bow|crossbow/.test(w)))
      ) {
        struck.add(id);
        if (aim(a, id, 13, !melee)) {
          cracks++;
          perWindow++;
        }
      } else fight(a, id, [boss], { advance: !roots.has(id) });
      return true;
    },
    result: () => {
      if (cracks < needed && standing(a, boss)) return null;
      if (a.scene.recordEnding !== false)
        a.objectiveDetails = { bowlBroken: cracks >= needed, nestFell: !standing(a, boss), cracks };
      return 'win';
    },
    endRound(r) {
      const p = a.record(boss).position;
      if (r === 6 && p.y <= 1 && p.x >= 4 && p.x <= 10) return 'missed';
      if (r >= 8) return 'missed';
      return null;
    },
  };
}
function hunt(a) {
  const { party, foes } = a.scene,
    boss = foes[0],
    needed = party.length < 5 ? 2 : 3,
    spent = new Set();
  let marks = 0,
    window = false,
    charges = a.scene.stores?.['заряд зуба Ивы'] ?? 1,
    result,
    lastTarget = null,
    mouth = 'W';
  const canAttack = (id, p) => {
    const q = a.record(id).position;
    return (mouth === 'W' ? q.x >= p.x + 1 : q.x <= p.x - 1) && distance(q, p) <= 4;
  };
  return {
    turn(id, side) {
      const r = a.board.round;
      if (side === 'hostile') {
        window = false;
        if (r < 2) return true;
        const target =
          lastTarget && standing(a, lastTarget) ? lastTarget : nearest(a, id, party)[0];
        if (!target) return true;
        const p = a.record(id).position,
          q = a.record(target).position;
        const dx = Math.sign(q.x - p.x),
          dy = Math.sign(q.y - p.y),
          travel = Math.min(marks ? 6 : 12, distance(p, q) - 1);
        const mid = {
          x: Math.min(16, Math.max(1, p.x + dx * Math.max(0, travel))),
          y: Math.min(12, Math.max(1, q.y)),
        };
        for (const k of living(a, party)) {
          const h = a.record(k).position;
          if (
            h.x > Math.min(p.x, mid.x) &&
            h.x < Math.max(p.x, mid.x) &&
            Math.abs(h.y - (p.y + ((mid.y - p.y) * (h.x - p.x)) / (mid.x - p.x))) < 1 &&
            !save(a, k, 13, ['dex'])
          )
            injury(a, k, a.dice.roll(6) + a.dice.roll(6));
        }
        if (!put(a, id, mid.x, mid.y)) put(a, id, mid.x, Math.min(12, mid.y + (dy || 1)));
        const at = a.record(id).position;
        mouth = q.x <= at.x ? 'W' : 'E';
        window = true;
        if (distance(at, q) <= 2)
          blow(a, id, target, {
            bonus: 6,
            count: 2,
            sides: 8,
            flat: 4,
            ac: a.state.characterSheets.get(target).armorClass,
            disadvantage: true,
          });
        return true;
      }
      const p = a.record(boss).position,
        dx = mouth === 'W' ? 1 : -1;
      const slot = party.indexOf(id);
      const goal = {
        x: Math.max(0, Math.min(17, p.x + dx * (1 + (slot % 3)))),
        y: Math.max(0, Math.min(13, p.y - 1 + Math.floor(slot / 3))),
      };
      walk(a, id, goal);
      if (window && canAttack(id, p)) {
        if (marks >= needed && charges && distance(a.record(id).position, p) <= 3) {
          charges--;
          a.objectiveDetails = { toothSpent: true };
          if (aim(a, id, 8, false, 'dex')) result = 'win';
        } else if (!spent.has(id) && marks < needed) {
          if (aim(a, id, 8, false, 'str')) {
            marks++;
            spent.add(id);
            lastTarget = id;
            window = false;
            if (party.length >= 5 && distance(a.record(id).position, p) <= 3)
              blow(a, boss, id, {
                bonus: 6,
                count: 2,
                sides: 8,
                flat: 4,
                ac: a.state.characterSheets.get(id).armorClass,
              });
          }
        }
      }
      return true;
    },
    result: () => result,
    endRound(r) {
      return r >= 8 ? (marks ? 'partial' : 'missed') : null;
    },
  };
}
export function specialBattle(a) {
  switch (a.scene.key) {
    case 'rubezh-step':
      return stair(a);
    case 'hull-walk':
      return hull(a);
    case 'last-touch':
      return mountain(a);
    case 'seam-nest':
      return nest(a);
    case 'widows-line-hunt':
      return hunt(a);
    default:
      return null;
  }
}
