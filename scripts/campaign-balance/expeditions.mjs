import { carry, mission, task } from './mission.mjs';
import { distance, near, standing, walk, fight } from './tactics.mjs';
import { cryptExit } from './crypt-exit.mjs';

const all = (...at) => at.map((p) => task(p));
const bundle = (places, to, options) => places.map((p) => carry(p, to, options));
export const specialistKeys = new Set([
  'long-planks-ambush',
  'battle-for-the-gate',
  'banner-hall-list',
  'six-strokes',
  'chain-rock-battle',
  'roof-duel',
]);
function burrow(a) {
  const { party } = a.scene;
  const taken = new Map();
  return mission(a, bundle(['I3', 'I6', 'J4', 'K5', 'L3', 'L6'], 'B4', { free: true }), {
    deadline: 5,
    foe(a, id, api) {
      if (!a.state.entities.get(id).name.includes('Молодой')) return false;
      const item = taken.get(id);
      if (item) {
        if (a.hp(id) < item.hp || a.hp(id) * 2 <= a.scene.state.statBlocks.get(id).hitPoints.max) {
          item.g.at = { ...a.record(id).position };
          item.g.lost = false;
          taken.delete(id);
          return true;
        }
        const p = { x: 17, y: a.record(id).position.y };
        walk(a, id, p);
        if (near(a, id, p, 0)) taken.delete(id);
        return true;
      }
      const g = api.goals
        .filter((g) => !g.holder && !g.done && !g.lost)
        .sort((l, r) => {
          const p = a.record(id).position;
          return distance(p, l.at) - distance(p, r.at);
        })[0];
      if (!g) return false;
      walk(a, id, g.at, 1);
      if (near(a, id, g.at) && !api.live(party).some((k) => near(a, k, g.at))) {
        g.lost = true;
        taken.set(id, { g, hp: a.hp(id) });
      }
      return true;
    },
    end(a, r, api) {
      for (const [id, item] of taken)
        if (!standing(a, id) || a.hp(id) < item.hp) {
          item.g.at = { ...a.record(id).position };
          item.g.lost = false;
          taken.delete(id);
        }
      if (r === 5 || (!taken.size && api.goals.every((g) => g.done || g.lost))) {
        const rescued = api.goals.flatMap((g, i) =>
          g.done || (g.holder && a.record(g.holder).position.x < 3) ? [i] : [],
        );
        a.objectiveDetails = { rescued };
        const n = rescued.length;
        return n === 6 ? 'win' : n ? 'partial' : 'missed';
      }
    },
  });
}
export function expedition(a) {
  const { party, foes, key } = a.scene;
  const route = (jobs, options = {}) => mission(a, jobs, options);
  switch (key) {
    case 'catapult-sortie':
      return route([task('H2', { work: 2 })], { exit: 'south', deadline: 6 });
    case 'knot-pier':
      return route(all('Q2', 'Q9'), { deadline: 4 });
    case 'reef-lanterns':
      return route(all('F10', 'J11', 'N10'), { soft: true, deadline: 4 });
    case 'pennants-alongside':
      return route(all('M2', 'M4', 'M7'), { deadline: 6, soft: true });
    case 'eagle-aerie':
      return route([carry('center', 'east', { work: 2 })]);
    case 'barge-boarding':
      return route(
        ['C4', 'I4', 'P4'].map((p) =>
          task(p, { work: 2, dc: 12, skills: ['athletics', 'acrobatics'], block: true }),
        ),
      );
    case 'velvet-waltz':
      return route(bundle(['M4', 'N8'], 'west', { free: true }), {
        exit: 'west',
        deadline: 6,
        soft: true,
      });
    case 'bank-doors':
      return route([carry('L5', 'west', { dropDC: 12 })], { deadline: 5 });
    case 'wound-ushers':
      return route(bundle(['H6', 'J6'], 'west', { free: true }), { soft: true });
    case 'shin-nets':
      return route([carry('C9', 'south')], { exit: 'south' });
    case 'strange-burrow':
      return burrow(a);
    case 'niche-guards':
      if (a.scene.trackCryptExit !== false) return cryptExit(a);
      return route([carry('M5', 'west', { speed: 3, noDash: true, dropDC: 12 })], { deadline: 6 });
    case 'garden-glass':
      return route(
        bundle(
          Array.from({ length: Math.floor(party.length / 2) }, (_, i) => ({ x: 4 + 2 * i, y: 7 })),
          'south',
          { free: true },
        ),
        { deadline: 5 },
      );
    case 'copper-steps-snatch':
      return route([carry('H7', 'east', { free: true })], {
        deadline: 5,
        end(a, r, api) {
          if (foes.some((id) => !standing(a, id))) return 'win';
          if (r === 5) return api.goals[0].at.x !== 0 ? 'win' : 'missed';
        },
      });
    case 'ferry-cable':
      return route([carry('C6', 'O7', { speed: 3, noDash: true, free: true }), task('L9')], {
        end(a, r, api) {
          if (api.live(foes).length <= foes.length / 2) return 'win';
        },
      });
    case 'burnt-grove':
      return route([carry('H6', 'C6', { speed: 3, noDash: true, free: true })], {
        end(a, r, api) {
          if (!api.live(foes).length) return 'win';
        },
      });
    case 'line-one':
      return route([carry('center', 'west', { free: true })], {
        deadline: 4,
        end(a, r, api) {
          const g = api.goals[0],
            p = g.holder ? a.record(g.holder).position : g.at;
          if (api.live(foes).filter((k) => near(a, k, p)).length >= 2) return 'missed';
        },
      });
    case 'locker-three':
      return route([task('L3', { work: 2 })], { deadline: 4 });
    case 'teeth-hollowed':
      return route([task('center')], {
        end(a, r, api) {
          if (api.live(foes).some((k) => a.record(k).position.x === 0)) return 'missed';
        },
      });
    case 'forest-hollowed':
      return route([carry('center', 'north')]);
    case 'throat-follower':
      return route([], {
        exit: 'east',
        standingExit: true,
        foe(a, id) {
          const white = party.filter(
            (k) =>
              standing(a, k) &&
              a.record(k).position.x < 20 &&
              !a.board.battlefield.difficult.some((p) => near(a, k, p, 0)),
          );
          fight(a, id, white);
          return true;
        },
        end(a) {
          if (a.hp(foes[0]) * 2 <= a.scene.state.statBlocks.get(foes[0]).hitPoints.max)
            return 'win';
        },
      });
    case 'fissure-spinners':
      return route([task('east')], { deadline: 5 });
    case 'brine-break':
      return route([...bundle(['I6', 'J8'], 'west'), task('B7')]);
    case 'net-deck':
      return route([carry('center', 'west')]);
    case 'radan-in-brine':
      return route(bundle(['I6', 'J7', 'I8'], 'west'));
    case 'throat-dust':
      return route(all('I5', 'P7'));
    case 'shoulder-wind':
      return route(bundle(party.length === 3 ? ['T5'] : ['T2', 'T5'], 'west', { speed: 3 }), {
        deadline: 6,
      });
    case 'depot-shot':
      return route([carry('center', 'east', { free: true })], { deadline: 5 });
    case 'paper-reception':
      return route([carry('center', 'east')], { soft: true });
    default:
      return null;
  }
}
