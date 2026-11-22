import { carry, defend, mission, paid, save, square, task } from './mission.mjs';
import { distance, fight, near, standing, walk } from './tactics.mjs';

const alive = (a, ids) => ids.filter((id) => standing(a, id));
const name = (a, id) => a.state.entities.get(id).name;
function contest(a, marker, limit, threshold, { boss = false, interrupt = false } = {}) {
  const { party, foes } = a.scene,
    pos = square(a, marker),
    work = new Map();
  let outcome;
  const actors = boss ? [foes.at(-1)] : foes;
  return {
    turn(id, side) {
      if (side === 'party') {
        const threat = alive(a, actors).sort(
          (l, r) => distance(a.record(l).position, pos) - distance(a.record(r).position, pos),
        )[0];
        if (a.scene.key === 'forge-passage') {
          const stations = ['H10', 'I10', 'G10', 'J10', 'G11', 'J11', 'G12', 'J12'];
          const point = square(a, stations[party.indexOf(id)]);
          walk(a, id, point);
          fight(a, id, foes, { focus: threat, advance: false });
        } else fight(a, id, foes, { focus: threat });
        return true;
      }
      if (!actors.includes(id)) return false;
      walk(a, id, pos, 1);
      const guard =
        a.scene.key === 'forge-passage' &&
        alive(a, party).find((k) => near(a, k, pos) && near(a, id, a.record(k).position));
      if (guard) {
        fight(a, id, [guard], { advance: false });
        return true;
      }
      if (near(a, id, pos) && paid(a, id)) {
        const prev = work.get(id);
        const amount = (prev && (!interrupt || a.hp(id) >= prev.hp) ? prev.amount : 0) + 1;
        work.set(id, { hp: a.hp(id), amount });
        if (amount >= threshold) outcome = 'missed';
      } else fight(a, id, party, { advance: false });
      return true;
    },
    result() {
      return (
        outcome ??
        (alive(a, actors).length &&
        !(a.scene.key === 'forge-passage' && alive(a, foes).length <= foes.length / 2)
          ? null
          : 'win')
      );
    },
    endRound(r) {
      return outcome ?? (r >= limit ? 'win' : null);
    },
  };
}
function holdBook(a) {
  const { party, foes } = a.scene;
  let holder = party.reduce((l, r) =>
    a.state.characterSheets.get(l).abilities.dex > a.state.characterSheets.get(r).abilities.dex
      ? l
      : r,
  );
  return {
    turn(id, side) {
      if (side === 'party') {
        if (!party.includes(holder) && near(a, id, a.record(holder).position) && paid(a, id))
          holder = id;
        else if (id === holder) {
          walk(a, id, square(a, 'west'), 1);
          fight(a, id, foes, { advance: false });
        } else
          fight(a, id, foes, { focus: holder && !party.includes(holder) ? holder : undefined });
      } else if (id === holder) walk(a, id, square(a, 'east'));
      else if (party.includes(holder)) {
        walk(a, id, a.record(holder).position, 1);
        if (near(a, id, a.record(holder).position) && paid(a, id)) {
          if (!save(a, holder, 11, ['str', 'dex'])) holder = id;
        } else fight(a, id, party, { advance: false });
      } else fight(a, id, party);
      return true;
    },
    endRound(r) {
      return r >= 3 || foes.filter((id) => !standing(a, id)).length >= 2
        ? party.includes(holder)
          ? 'win'
          : 'missed'
        : null;
    },
  };
}
function candles(a) {
  const { party } = a.scene,
    lit = new Set(),
    need = party.length < 7 ? 3 : 4;
  return {
    turn(id, side) {
      if (side === 'party' && !lit.has(id)) {
        const p = a.record(id).position;
        if (p.y < 6) walk(a, id, { x: p.x, y: 7 });
        if (paid(a, id)) lit.add(id);
        return true;
      }
      if (side === 'hostile' && name(a, id).includes('Голос')) {
        const target = alive(a, [...lit]).sort(
          (l, r) =>
            distance(a.record(id).position, a.record(l).position) -
            distance(a.record(id).position, a.record(r).position),
        )[0];
        if (target) {
          const hp = a.hp(target);
          fight(a, id, party, { focus: target });
          if (a.hp(target) < hp && lit.delete(target)) {
            a.objectiveDetails = { snuffed: (a.objectiveDetails?.snuffed ?? 0) + 1 };
          }
          return true;
        }
      }
      return false;
    },
    endRound(r) {
      return r === 4
        ? alive(a, [...lit]).filter((k) => a.record(k).position.y >= 6).length >= need
          ? 'win'
          : 'missed'
        : null;
    },
  };
}
function cordon(a) {
  const { party, foes } = a.scene;
  let escaped = 0;
  return {
    turn(id, side) {
      if (side === 'hostile') {
        if (alive(a, foes).length > foes.length / 2) {
          walk(a, id, { x: 13, y: 5 }, 0);
          fight(a, id, party, { advance: false });
        }
      } else fight(a, id, foes);
      return true;
    },
    endRound(r) {
      if (
        r >= 2 &&
        (alive(a, foes).length <= foes.length / 2 ||
          !alive(a, foes).some((id) => a.record(id).position.x >= 11))
      )
        escaped++;
      return r === 4 ? (escaped >= 2 ? 'win' : escaped ? 'partial' : 'missed') : null;
    },
  };
}
function dock(a) {
  const { party } = a.scene;
  return {
    turn(id, side) {
      if (side === 'hostile') return false;
      const i = party.indexOf(id),
        p = { x: 17 - (i % 2), y: 3 + Math.floor(i / 2) };
      walk(a, id, p);
      if (
        !near(a, id, p, 0) &&
        a.act({ type: 'TakeAction', combatantId: id, action: 'dash' }, false)
      )
        walk(a, id, p);
      return true;
    },
    endRound(r) {
      const inside = alive(a, party).filter((k) => {
        const p = a.record(k).position;
        return p.x >= 16 && p.y >= 3 && p.y <= 6;
      });
      return inside.length >= 2 ? 'win' : r >= 3 ? 'missed' : null;
    },
  };
}
function sickle(a) {
  const { party, foes } = a.scene;
  let cut = 0,
    previous = null;
  const thief = foes.at(-1),
    bell = square(a, 'south');
  return {
    turn(id, side) {
      if (side === 'party') {
        fight(a, id, foes, { focus: thief });
        return true;
      }
      if (id !== thief) return false;
      if (previous !== null && a.hp(id) < previous) cut = 0;
      walk(a, id, bell, 1);
      if (near(a, id, bell) && paid(a, id)) {
        cut++;
        previous = a.hp(id);
      } else fight(a, id, party, { advance: false });
      return true;
    },
    result() {
      return !standing(a, thief) ||
        a.hp(thief) <= a.scene.state.statBlocks.get(thief).hitPoints.max / 2
        ? 'win'
        : cut >= 2
          ? 'missed'
          : null;
    },
  };
}
function evacuation(a) {
  const { party, foes } = a.scene;
  let families = 0;
  return {
    turn(id, side) {
      if (side === 'party' && party.indexOf(id) < 2) {
        walk(a, id, { x: 11, y: 1 + party.indexOf(id) }, 0);
        fight(a, id, foes, { advance: false });
        return true;
      }
      return false;
    },
    endRound(r) {
      if (
        alive(a, party).filter((k) => {
          const x = a.record(k).position.x;
          return x >= 8 && x <= 13;
        }).length >= 2 &&
        !alive(a, foes).some((k) => a.record(k).position.x >= 14)
      )
        families++;
      return families >= 4 ? 'win' : r >= 6 ? (families ? 'partial' : 'missed') : null;
    },
  };
}
export function contestFor(a) {
  const { key } = a.scene;
  switch (key) {
    case 'block-search':
      return holdBook(a);
    case 'coal-tower-breach':
      return evacuation(a);
    case 'first-supper':
      return candles(a);
    case 'cord-row-night':
      return sickle(a);
    case 'white-thread-cordon':
      return cordon(a);
    case 'dock-catchers':
      return dock(a);
    case 'forge-passage':
      return contest(a, 'H11', 4, 1);
    case 'water-tower-night':
      return defend(a, ['V3'], 5, { radius: 1, enemyRadius: 1 });
    case 'pack-on-the-ford':
      return defend(a, ['G6', 'H7', 'H8', 'I9'], 3, {
        foe(a, id) {
          const p = a.record(id).position;
          const onPath = a.scene.party.filter(
            (k) =>
              standing(a, k) &&
              a.record(k).position.x <= p.x &&
              Math.abs(a.record(k).position.y - p.y) <= 1,
          );
          walk(a, id, { x: 0, y: p.y });
          fight(a, id, onPath, { advance: false });
          return true;
        },
        score: (lost) => (lost.size ? 'missed' : 'win'),
      });
    case 'fire-on-the-tarn':
      return defend(a, ['C4', 'C6', 'C8', 'C10'], 4);
    case 'camp-spinners':
      return mission(a, [task('center')], {
        end: () => null,
        hero(a, id, api) {
          if (near(a, id, square(a, 'center')) && paid(a, id)) {
            api.mark('win');
            return true;
          }
          return false;
        },
      });
    case 'bridge-chips':
      return mission(a, [task('Q2', { block: true, blockRadius: 1 })], {
        deadline: 4,
        end(a, r, api) {
          if (r === 4) return api.goals[0].done ? 'win' : 'missed';
        },
      });
    case 'market-scouts':
      return mission(a, [carry('center', 'south', { free: true })], { deadline: 3 });
    default:
      return null;
  }
}
