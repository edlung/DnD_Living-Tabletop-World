// The fork is on the printed encounter, after the expedition has paid its costs.
import { paid, square } from '../campaign-balance/mission.mjs';
import { distance, fight, near, standing, walk } from '../campaign-balance/tactics.mjs';
import { CRYPT } from '../adventures/hollowmere/world.ts';

const action = (a, id, kind) => a.act({ type: 'TakeAction', combatantId: id, action: kind }, false);
const surge = (a, id) =>
  a.act({ type: 'UseFeature', characterId: id, feature: 'action-surge' }, false);
const awake = (a) => a.scene.party.filter((id) => standing(a, id));
function reach(a, id, target, r = 1) {
  walk(a, id, target, r);
  if (standing(a, id) && !near(a, id, target, r) && action(a, id, 'dash')) walk(a, id, target, r);
  return standing(a, id) && near(a, id, target, r);
}
function bell(a, base) {
  // H5 touches both the cleat and the clapper. The fighter can pay twice
  // in one turn only when the rules engine accepts Action Surge.
  const both = square(a, 'H5'),
    jobs = ['G5', 'I6'].map((p) => square(a, p));
  let tied = 0;
  return {
    ...base,
    turn(id, side) {
      if (side === 'hostile') return base.turn?.(id, side);
      reach(a, id, both, 0);
      if (!standing(a, id)) return true;
      for (let n = 0; n < 2 && tied < 2; n++) {
        const p = jobs[tied];
        if (!near(a, id, p) || (!paid(a, id) && !(surge(a, id) && paid(a, id)))) break;
        tied++;
        a.objectiveDetails = { bellActions: tied };
      }
      return true;
    },
    result: () => (tied === 2 ? 'win' : base.result?.()),
  };
}
function pressure(a, base) {
  if (a.scene.key === 'sunken-bell') return bell(a, base);
  return {
    ...base,
    turn(id, side) {
      if (side === 'hostile') return base.turn?.(id, side);
      if (a.board.round > 1) return base.turn?.(id, side);
      if (a.scene.key === 'widows-line-hunt') {
        // Spread across separate approaches on the first dive. Each remaining
        // turn uses the same harpoons, hit thresholds and charge as the control.
        const i = a.scene.party.indexOf(id);
        reach(a, id, { x: 4 + (i % 2), y: i % 2 ? 3 : 9 }, 0);
        if (standing(a, id)) action(a, id, 'dodge');
      } else {
        const target = [...a.scene.foes]
          .filter((k) => standing(a, k))
          .sort((l, r) => a.hp(l) - a.hp(r))[0];
        fight(a, id, a.scene.foes, { focus: target });
        if (standing(a, id) && surge(a, id)) {
          if (!base.turn?.(id, side)) fight(a, id, a.scene.foes, { focus: target });
        }
      }
      return true;
    },
  };
}
function alternative(a, base) {
  const key = a.scene.key;
  let result,
    freed,
    bait = 0;
  const left = new Set();
  const east = (id) => {
    const p = a.record(id).position,
      field = a.board.battlefield,
      x = field.width - 1;
    return (
      Array.from({ length: field.height }, (_, y) => ({ x, y }))
        .filter(
          (q) => !a.board.combatants.some((c) => c.entityId !== id && near(a, c.entityId, q, 0)),
        )
        .sort((l, r) => distance(l, p) - distance(r, p))[0] ?? { x, y: p.y }
    );
  };
  return {
    ...base,
    turn(id, side) {
      if (side === 'hostile') {
        if (key === 'radan-in-brine' && bait && a.board.round < bait + 3) {
          walk(a, id, square(a, 'east'), 1);
          return true;
        }
        return base.turn?.(id, side);
      }
      switch (key) {
        case 'sunken-bell': {
          const bolt = square(a, 'D3'),
            door = square(a, 'A3');
          if (!freed && reach(a, id, bolt) && paid(a, id)) freed = id;
          if (freed && standing(a, freed) && id === freed && reach(a, id, door, 0)) {
            result = 'prisoners-out';
            const captive = a.state.entities.get('old-matthis');
            const escorted =
              captive?.status === 'active' && captive.placement?.locationId === CRYPT
                ? ['old-matthis']
                : [];
            a.objectiveDetails = { escort: id, escorted, freed: true, exit: 'A3', bellRings: true };
          }
          return true;
        }
        case 'cellar-rats': {
          const hatch = square(a, 'B4');
          reach(a, id, hatch);
          if (
            standing(a, id) &&
            near(a, id, hatch) &&
            a.scene.party.every((k) => a.record(k).position.x <= 2) &&
            paid(a, id)
          ) {
            result = 'withdrawn';
            a.objectiveDetails = { hatchClosed: true, saltLost: true };
          }
          return true;
        }
        case 'drowned-chapel':
        case 'sunken-mill':
        case 'marsh-lights':
        case 'flooded-stair': {
          const edge = square(a, 'west');
          reach(a, id, edge);
          const allAtDoor =
            key !== 'flooded-stair' || a.scene.party.every((k) => near(a, k, edge, 1));
          if (standing(a, id) && near(a, id, edge) && allAtDoor && paid(a, id)) {
            result = 'withdrawn';
            a.objectiveDetails = {
              'drowned-chapel': { inscriptionCopied: true },
              'sunken-mill': { ledgerReadAfterBoats: true },
              'flooded-stair': { sacristyBarred: true, lastBoatLost: true },
              'marsh-lights': { poleMarks: true, longChannel: true, daylightLost: true },
            }[key];
          }
          return true;
        }
        case 'niche-guards': {
          // The tablet is at the altar. A hero must get there, read it aloud
          // and only then can the group move the heavy box without interference.
          if (!freed && reach(a, id, square(a, 'M5')) && paid(a, id)) {
            freed = id;
            a.objectiveDetails = { namesReadBy: id };
            a.disengagedFoes = true;
          }
          return freed ? base.turn(id, side) : true;
        }
        case 'radan-in-brine': {
          if (!bait && a.scene.stores['вода'] > 0 && paid(a, id)) {
            bait = a.board.round;
            a.objectiveDetails = { baitWater: true, baitRound: bait };
            return true;
          }
          return base.turn(id, side);
        }
        case 'widows-line-hunt': {
          if (reach(a, id, east(id), 0)) {
            left.add(id);
            a.objectiveDetails = { eastExit: [...left] };
            if (awake(a).some((k) => !left.has(k)))
              a.act({
                type: 'RemoveCombatant',
                entityId: id,
                reason: 'Crossed the eastern edge towards the Dry Pass',
              });
          }
          return true;
        }
        case 'fissure-spinners': {
          // With light the bundle tears for +2. An empty reserve only
          // permits shouting a warning to Stas from below and leaving it.
          if (paid(a, id)) {
            const fire = a.scene.stores['запас глубины'] > 0;
            result = fire ? 'burned' : 'warning-sent';
            a.objectiveDetails = { witness: 'Стась', burned: fire, bundle: fire ? 2 : 0 };
          }
          return true;
        }
        default:
          throw Error('No alternative for ' + key);
      }
    },
    result: () => {
      if (key === 'widows-line-hunt' && left.size && awake(a).every((k) => left.has(k)))
        return 'east-exit';
      return result ?? base.result?.();
    },
  };
}
export function tacticsFor(policy) {
  if (policy === 'pressure') return pressure;
  if (policy === 'alternative')
    return (a, base) => {
      const alt = alternative(a, base);
      if (a.scene.key !== 'niche-guards') return alt;
      return {
        ...alt,
        turn(id, side) {
          if (side === 'hostile' && a.objectiveDetails?.namesReadBy) return true;
          return alt.turn(id, side);
        },
      };
    };
}
