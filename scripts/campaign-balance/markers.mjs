import { attackRoll } from '../../packages/rules/src/index.ts';
import { mission, paid, square, task } from './mission.mjs';
import { distance, fight, near, standing, walk } from './tactics.mjs';

const live = (a, ids) => ids.filter((id) => standing(a, id));
const half = (a, id) => a.hp(id) * 2 <= a.scene.state.statBlocks.get(id).hitPoints.max;
function ladders(a) {
  const { party } = a.scene;
  // A fallen raider is replaced once at the end of the round by a fresh raider from that ladder.
  // Give the replacements isolated identities so a dead entity never needs to be resurrected.
  const enemies = [...a.scene.foes],
    originals = new Map(enemies.map((id) => [id, id]));
  let serial = 0;
  a.scene = { ...a.scene, foes: enemies };
  const encounter = mission(
    a,
    ['E1', 'J1', 'O1'].map((at) => task(at, { block: true })),
    {
      deadline: 4,
      foe(a, id, api) {
        const middle = api.goals.find((g) => g.at.x === 9 && !g.done);
        if (middle && id === enemies[0]) {
          walk(a, id, middle.at);
          fight(a, id, party, { advance: false });
          return true;
        }
        return false;
      },
      end(a, r, api) {
        if (r >= 4) return null;
        for (const g of api.goals.filter((g) => !g.done)) {
          const old = enemies.find((id) => !standing(a, id));
          if (!old) break;
          const original = originals.get(old),
            entityId = 'balance-reinforcement-' + ++serial;
          const entities = new Map(a.state.entities),
            statBlocks = new Map(a.state.statBlocks);
          entities.set(entityId, { ...a.scene.state.entities.get(original), entityId });
          statBlocks.set(entityId, a.scene.state.statBlocks.get(original));
          const pts = [
            g.at,
            ...[-1, 0, 1].flatMap((x) => [0, 1].map((y) => ({ x: g.at.x + x, y: g.at.y + y }))),
          ];
          const cell = pts.find(
            (p) =>
              !a.board.combatants.some(
                (c) =>
                  a.state.entities.get(c.entityId)?.status === 'active' &&
                  near(a, c.entityId, p, 0),
              ),
          );
          if (!cell) continue;
          a.act({ type: 'RemoveCombatant', entityId: old, reason: 'Replaced by the next climber' });
          a.state = { ...a.state, entities, statBlocks };
          a.act({ type: 'AddCombatant', entityId, side: 'hostile', position: cell });
          enemies[enemies.indexOf(old)] = entityId;
          originals.set(entityId, original);
        }
      },
    },
  );
  return encounter;
}
function laska(a) {
  const { foes, party } = a.scene,
    skipper = foes.at(-1),
    sailor = foes[0],
    barrel = square(a, 'Q5');
  let lit = false,
    progress = 0,
    hp = 0;
  const m = mission(a, [task('G3'), task('L3')], {
    holdOpen: true,
    foe(a, id) {
      if (id !== sailor || lit) return false;
      walk(a, id, barrel);
      if (near(a, id, barrel, 0) && paid(a, id)) {
        if (a.hp(id) < hp) progress = 0;
        hp = a.hp(id);
        if (++progress === 2) lit = true;
      } else fight(a, id, party, { advance: false });
      return true;
    },
    end(a, r, api) {
      if (half(a, skipper) || !api.live(foes).length) return lit ? 'partial' : 'win';
    },
  });
  return m;
}
function cutter(a) {
  const { party, foes } = a.scene,
    box = square(a, 'center'),
    boat = square(a, 'I2'),
    cutter = party.length === 3 ? null : foes[0];
  let carrier = null,
    boxLost = false,
    cut = 0;
  return {
    turn(id, side) {
      if (side === 'party') {
        const target = carrier ?? (cutter && standing(a, cutter) ? cutter : null);
        fight(a, id, foes, { focus: target });
        return true;
      }
      if (cutter === id && cut < 2) {
        walk(a, id, boat, 1);
        if (near(a, id, boat) && paid(a, id)) cut++;
        return true;
      }
      if (carrier && !standing(a, carrier)) {
        Object.assign(box, a.record(carrier).position);
        carrier = null;
      }
      if (!boxLost && !carrier) {
        walk(a, id, box, 1);
        if (near(a, id, box) && paid(a, id)) carrier = id;
      } else if (carrier === id) {
        const mates = live(a, foes).filter((k) => k !== id && near(a, k, a.record(id).position));
        walk(a, id, { x: 17, y: a.record(id).position.y }, 0, mates.length ? 3 : 2);
        if (a.record(id).position.x === 17) boxLost = true;
      } else fight(a, id, party);
      return true;
    },
    result() {
      if (live(a, foes).length <= foes.length / 2 || (boxLost && (!cutter || cut === 2)))
        return boxLost && cut === 2 ? 'missed' : boxLost || cut === 2 ? 'partial' : 'win';
      return null;
    },
  };
}
function hostage(a) {
  const { party, foes } = a.scene;
  let p = square(a, 'H6'),
    held = null,
    screen = new Set();
  return {
    turn(id, side) {
      if (side === 'party') {
        if (held) {
          walk(a, id, p, 1);
          if (near(a, id, p) && paid(a, id)) held = null;
        } else if (!live(a, party).some((k) => k !== id && near(a, k, p))) walk(a, id, p, 1);
        fight(a, id, foes, { focus: held, advance: false });
      } else {
        walk(a, id, p, 1);
        if (near(a, id, p) && !held && paid(a, id)) {
          const ally = live(a, party).find((k) => near(a, k, p) && !screen.has(k));
          if (ally) {
            screen.add(ally);
          } else if (attackRoll(a.dice, { modifier: 3, target: 10 }).success) held = id;
        } else if (held === id) p = { ...a.record(id).position };
        else fight(a, id, party, { advance: false });
      }
      return true;
    },
    endRound(r) {
      screen = new Set();
      if (held && !standing(a, held)) held = null;
      return r >= 4 || live(a, foes).length <= foes.length / 2 ? (held ? 'missed' : 'win') : null;
    },
  };
}
function packet(a) {
  const { foes, party } = a.scene,
    carrier = foes[0];
  let captured = false,
    escaped = false;
  return mission(
    a,
    ['B2', 'B7'].map((at) => task(at, { work: 2, dc: 12 })),
    {
      completed() {
        return escaped ? 'partial' : 'win';
      },
      hero(a, id) {
        if (id !== party[0] || captured || escaped) return false;
        fight(a, id, foes, { focus: carrier });
        if (!standing(a, carrier) || half(a, carrier)) captured = true;
        return true;
      },
      foe(a, id) {
        if (id !== carrier || captured || escaped) return false;
        if (half(a, id)) {
          captured = true;
          return true;
        }
        walk(a, id, square(a, 'west'));
        if (near(a, id, square(a, 'west'), 0)) escaped = true;
        return true;
      },
    },
  );
}
function pearl(a) {
  const { key, party, foes } = a.scene;
  if (key === 'auction-hall') return mission(a, [task('east')], { soft: true });
  const porters = foes.filter((id) => !a.state.entities.get(id).name.includes('подручн'));
  const p = square(a, 'center'),
    gate = square(a, 'east');
  let secured = false;
  return {
    turn(id, side) {
      if (side === 'party') {
        walk(a, id, p, 1);
        if (near(a, id, p) && paid(a, id)) secured = true;
        else fight(a, id, foes, { soft: true, advance: false });
      } else if (porters.includes(id)) {
        const step = Math.sign(gate.x - p.x);
        p.x += step;
      } else fight(a, id, party, { soft: true });
      return true;
    },
    result() {
      return secured ? 'win' : distance(p, gate) === 0 ? 'missed' : null;
    },
  };
}
export function markerScene(a) {
  switch (a.scene.key) {
    case 'first-ladders':
      return ladders(a);
    case 'laska-boarding':
      return laska(a);
    case 'night-boarders':
      return cutter(a);
    case 'ash-patrol':
      return hostage(a);
    case 'white-gyrfalcon-boarding':
      return packet(a);
    case 'quay-chase':
    case 'auction-hall':
      return pearl(a);
    default:
      return null;
  }
}
