import assert from 'node:assert/strict';
import { openScene } from './open-scenes.mjs';
import { markerScene } from './markers.mjs';
import { contestFor } from './contests.mjs';
import { expedition, specialistKeys } from './expeditions.mjs';
import { specialBattle } from './bosses.mjs';
import { defend } from './mission.mjs';
import { standing } from './tactics.mjs';

// The six cross-board finales have independent published simulators in finales.py.
export function scenario(a) {
  const { slug, key, foes } = a.scene;
  if (
    ['hollowmere', 'ravenford', 'acorn-express', 'lighthouse'].includes(slug) ||
    specialistKeys.has(key)
  )
    return null;
  if (key === 'white-at-the-ledge') {
    const posts = ['B17', 'D17', 'F17', 'H17', 'J17', 'L17'].slice(
      0,
      a.scene.stores?.['мулы'] ?? 4,
    );
    const goal = defend(a, posts, 4, {
      score(lost) {
        a.objectiveDetails = { mulesLost: lost.size };
        return lost.size === posts.length ? 'missed' : lost.size ? 'partial' : 'win';
      },
    });
    return {
      ...goal,
      endRound(r) {
        const mules = goal.endRound(r);
        if (r === 4 || !foes.some((id) => standing(a, id)))
          return a.hp(foes.at(-1)) <= 37 && mules === 'win'
            ? 'win'
            : mules === 'missed'
              ? 'missed'
              : 'partial';
        return null;
      },
    };
  }
  const result =
    openScene(a) ?? markerScene(a) ?? contestFor(a) ?? expedition(a) ?? specialBattle(a);
  assert.ok(result, slug + '/' + key);
  return result;
}
