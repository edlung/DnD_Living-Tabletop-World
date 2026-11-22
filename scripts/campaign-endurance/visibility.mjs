// Chapter-specific light and breakfast penalties printed on the expedition sheets.
import { attackPlan } from '../../packages/combat/src/index.ts';
export function expeditionDice(arena, cmd) {
  const reserve = arena.scene.stores?.['запас глубины'];
  if (
    reserve === undefined ||
    reserve > 3 ||
    cmd.type !== 'Attack' ||
    !arena.scene.party.includes(cmd.combatantId)
  )
    return arena.dice;
  const p = attackPlan(arena.state, arena.board, cmd.combatantId, cmd.attackId, cmd.targetId);
  if (!p.legal || p.disadvantage || (reserve === 0 ? p.distanceFt <= 5 : p.melee))
    return arena.dice;
  let first = null,
    cancel = false;
  return {
    roll(sides) {
      if (sides !== 20) return arena.dice.roll(sides);
      if (cancel) {
        cancel = false;
        return first;
      }
      if (first !== null) return arena.dice.roll(sides);
      first = arena.dice.roll(20);
      if (p.advantage) {
        cancel = true;
        return first;
      }
      return Math.min(first, arena.dice.roll(20));
    },
  };
}
export function abilityRoll(arena, abilities, type) {
  const st = arena.scene.stores,
    reserve = st?.['запас глубины'];
  const weak =
    (type === 'check' &&
      (reserve === 0 || (reserve <= 3 && abilities.every((x) => ['str', 'con'].includes(x))))) ||
    (st?.breakfast === 0 && abilities.every((x) => x === (type === 'check' ? 'str' : 'con')));
  const roll = arena.dice.roll(20);
  return weak ? Math.min(roll, arena.dice.roll(20)) : roll;
}
