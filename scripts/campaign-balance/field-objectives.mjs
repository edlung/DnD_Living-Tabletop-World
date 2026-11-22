import { mission, task, square } from './mission.mjs';
import { standing, walk, fight, near } from './tactics.mjs';

// These decisions are printed on the encounter cards. The DM plays the opposition's goal.
export function fieldObjective(a) {
  const { key, party, foes } = a.scene;
  const live = (ids) => ids.filter((k) => standing(a, k)).length;
  const retreat = () => live(party) > 0 && live(party) * 2 <= party.length;
  if (key === 'barge-boarding')
    return () => {
      const captain = foes.at(-1),
        board = square(a, 'P6');
      const ropes = ['C4', 'I4', 'P4'].map((at) =>
        task(at, { work: 2, dc: 12, skills: ['athletics', 'acrobatics'], block: true }),
      );
      const goal = mission(a, ropes, {
        foe(arena, id) {
          if (arena.board.round === 1) return true;
          walk(arena, id, board, 1);
          const defenders = party.filter((k) => standing(arena, k) && near(arena, k, board, 2));
          fight(arena, id, defenders, { advance: false });
          return true;
        },
        end(arena, r, api) {
          // Vesta and her assistant cut one rope, two successful DC 12 actions like the heroes.
          const rope = api.goals[2];
          if (!rope.done && !foes.some((k) => standing(arena, k) && near(arena, k, rope.at, 0))) {
            if (arena.dice.roll(20) >= 12 && --rope.left <= 0) rope.done = true;
          }
          if (api.goals.every((g) => g.done)) return 'win';
          if (r === 5) return 'pursuit';
        },
      });
      return {
        ...goal,
        result: () =>
          goal.result() ??
          (a.hp(captain) * 2 <= a.scene.state.statBlocks.get(captain).hitPoints.max
            ? 'win'
            : retreat()
              ? 'withdrawn'
              : null),
      };
    };
  if (key === 'white-gyrfalcon-boarding')
    return (base) => ({
      ...base,
      result: () => base.result?.() ?? (retreat() ? 'withdrawn' : null),
    });
  if (key === 'willow-ford-ambush')
    return () => ({
      result: () => (live(foes) * 2 <= foes.length ? 'win' : retreat() ? 'withdrawn' : null),
      endRound: (r) => (r === 3 ? 'withdrawn' : null),
    });
  if (key === 'cellar-rats')
    return () => {
      const clear = mission(a, [task('G4', { work: 2 })]);
      return {
        ...clear,
        result: () => clear.result() ?? (!live(foes) ? 'win' : retreat() ? 'withdrawn' : null),
      };
    };
  if (key === 'flooded-stair' || key === 'sunken-bell')
    return () => {
      const stair = key === 'flooded-stair';
      const jobs = stair ? [task('E5', { work: 2 })] : [task('G5'), task('I6')];
      const goal = mission(a, jobs);
      return {
        ...goal,
        result: () =>
          goal.result() ?? (!live(foes) ? 'win' : stair && retreat() ? 'withdrawn' : null),
      };
    };
  if (key === 'drowned-chapel' || key === 'marsh-lights')
    return () => ({
      result: () => (!live(foes) ? 'win' : retreat() ? 'withdrawn' : null),
    });
  if (key === 'sunken-mill')
    return () => ({
      result: () =>
        a.hp(foes[0]) * 2 < a.scene.state.statBlocks.get(foes[0]).hitPoints.max
          ? 'parley'
          : !live(foes)
            ? 'win'
            : retreat()
              ? 'withdrawn'
              : null,
    });
  return (base) => base;
}
