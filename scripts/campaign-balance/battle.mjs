import assert from 'node:assert/strict';
import { Arena } from './arena.mjs';
import { standing, support, fight } from './tactics.mjs';
import { fieldObjective } from './field-objectives.mjs';
import { scenario } from './objectives.mjs';

export function battle(s, seed, { mode = 'book', beforePartyTurn, tactics } = {}) {
  const a = new Arena(s, seed);
  const book = mode === 'book' ? scenario(a) : null;
  const field =
    s.fieldObjective === undefined && ['hollowmere', 'sky-archipelago'].includes(s.slug)
      ? fieldObjective
      : s.fieldObjective;
  const printed = mode === 'book' && field ? field(a)(book) : book;
  const goal = tactics ? tactics(a, printed) : printed;
  let outcome,
    round = 1;
  const still = (ids) => ids.some((k) => standing(a, k));
  for (let turn = 0; !outcome; turn++) {
    if (!a.board) throw Error(s.key + ' lost encounter without result');
    const c = a.current,
      id = c.entityId;
    round = a.board.round;
    if (round > 50) {
      outcome = 'limit';
      break;
    }
    if (standing(a, id)) {
      if (c.side === 'party') {
        beforePartyTurn?.(a, id);
        support(a, id);
      }
      let handled = goal?.turn?.(id, c.side);
      if (!handled)
        fight(a, id, c.side === 'party' ? s.foes : s.party, {
          soft: goal?.soft ?? false,
          focus: c.side === 'hostile' ? goal?.focus?.() : undefined,
        });
    }
    outcome =
      goal?.result?.() ??
      (!still(s.party) && !goal?.waitForClock ? 'defeat' : !goal && !still(s.foes) ? 'win' : null);
    if (outcome) break;
    if (goal?.closingRound === round && a.board?.currentIndex === a.board?.combatants.length - 1) {
      outcome = goal.endRound(round);
      if (outcome) break;
    }
    if (a.board && a.current.entityId === id) a.act({ type: 'EndTurn', combatantId: id });
    if (!a.board || a.board.round > round) outcome = goal?.endRound?.(round);
    if (!a.board && !outcome)
      outcome = !still(s.party) ? 'defeat' : (goal?.result?.() ?? (!goal ? 'win' : null));
    if (!a.board && !outcome) throw Error(s.key + ' goals unresolved after combat');
    assert.ok(turn < 1100, s.key + ' turn loop');
  }
  const hp = s.party.reduce((n, k) => n + Math.max(0, a.hp(k)), 0);
  const max = s.party.reduce((n, k) => n + s.state.characterSheets.get(k).hitPoints.max, 0);
  return {
    arena: a,
    outcome,
    round,
    down: a.down.size,
    hp: Math.round((1 - hp / max) * 100),
    dice: a.dice.counts,
    stats: a.stats,
  };
}
