import { carry, mission } from './mission.mjs';

// Drop the box or bring it up, then account for every person at the half-hour.
// A death save can put a hero back on their feet before that clock strikes.
export function cryptExit(a) {
  const party = a.scene.party;
  const goal = mission(
    a,
    [carry('M5', 'west', { speed: 3, noDash: true, dropDC: 12, toReach: 0 })],
    { exit: 'west', foeSoft: true },
  );
  const book = goal.progress;
  function finish() {
    const escaped = [...book.gone];
    const taken = party.filter(
      (k) => !book.gone.has(k) && a.state.entities.get(k).status === 'active',
    );
    const boxOut = book.goals[0].done;
    a.objectiveDetails = { ...a.objectiveDetails, boxOut, escaped, taken };
    return escaped.length ? (boxOut ? 'win' : 'partial') : 'defeat';
  }
  return {
    ...goal,
    waitForClock: true,
    closingRound: 6,
    result: () => (book.gone.size === party.length ? finish() : null),
    endRound: (r) => (r >= 6 ? finish() : null),
  };
}
