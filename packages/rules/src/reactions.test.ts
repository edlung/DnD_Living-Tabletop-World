import { describe, expect, it } from 'vitest';

import { applyCast, checkCast } from './casting.ts';
import { scriptedDice } from './dice.ts';
import { checkCounterspell, resolveCounterspell, type CounterspellTrigger } from './reactions.ts';
import { elowen, myTurn, theirTurn } from './testing/elowen.ts';
import { startTurn } from './turn.ts';

/** The mandatory Ravenford reaction case: the Goblin Shaman casts; Elowen may Counterspell. */
const shamanCasting: CounterspellTrigger = {
  casterDistanceFt: 40,
  casterVisible: true,
  components: ['V', 'S'],
};
const reason = (result: ReturnType<typeof checkCounterspell>) =>
  result.legal ? 'LEGAL' : result.reason;

describe('Counterspell eligibility', () => {
  it('is legal on another creature’s turn within 60 ft against a visible caster', () => {
    const plan = checkCounterspell(elowen(), theirTurn(), shamanCasting, 3);
    expect(plan.legal && [plan.economy, plan.slotLevel, plan.saveDc]).toEqual(['reaction', 3, 16]);
  });

  it.each([
    [{ ...shamanCasting, casterDistanceFt: 65 }, 'OUT_OF_RANGE'],
    [{ ...shamanCasting, casterVisible: false }, 'TARGET_NOT_VISIBLE'],
    [{ ...shamanCasting, components: [] }, 'NO_VALID_TRIGGER'],
  ] as const)('rejects trigger %o with %s', (trigger, expected) => {
    expect(reason(checkCounterspell(elowen(), theirTurn(), trigger, 3))).toBe(expected);
  });

  it('needs a level 3+ slot that is still available', () => {
    expect(reason(checkCounterspell(elowen(), theirTurn(), shamanCasting, 2))).toBe('SLOT_TOO_LOW');
    const dry = elowen({
      spellSlots: { max: [4, 3, 3, 3, 2, 1, 0, 0, 0], expended: [4, 3, 3, 3, 2, 1, 0, 0, 0] },
    });
    expect(reason(checkCounterspell(dry, theirTurn(), shamanCasting, 3))).toBe('NO_SLOT');
    expect(reason(checkCounterspell(elowen(), theirTurn(), shamanCasting, 6))).toBe('LEGAL');
  });

  it('uses the one Reaction of the round, restored at the start of her own turn', () => {
    const plan = checkCounterspell(elowen(), theirTurn(), shamanCasting, 3);
    if (!plan.legal) throw new Error(plan.reason);
    const after = applyCast(elowen(), theirTurn(), plan);
    expect(after.turn.reactionAvailable).toBe(false);
    const nextEnemyTurn = startTurn(false, after.turn);
    expect(reason(checkCounterspell(after.sheet, nextEnemyTurn, shamanCasting, 3))).toBe(
      'NO_REACTION',
    );
    const ownTurn = startTurn(true, nextEnemyTurn);
    expect(ownTurn.reactionAvailable).toBe(true);
  });

  it('obeys one spell slot per turn, on any turn (SRD 5.2.1)', () => {
    const fireball = checkCast(elowen(), myTurn(), {
      spellId: 'fireball',
      using: { slotLevel: 3 },
      target: { distanceFt: 30, visible: true },
    });
    if (!fireball.legal) throw new Error(fireball.reason);
    const after = applyCast(elowen(), myTurn(), fireball);
    expect(reason(checkCounterspell(after.sheet, after.turn, shamanCasting, 3))).toBe(
      'SLOT_ALREADY_USED_THIS_TURN',
    );
    expect(
      reason(checkCounterspell(after.sheet, startTurn(false, after.turn), shamanCasting, 3)),
    ).toBe('LEGAL');
  });

  it('is impossible while Incapacitated', () => {
    expect(
      reason(
        checkCounterspell(elowen({ conditions: ['incapacitated'] }), theirTurn(), shamanCasting, 3),
      ),
    ).toBe('INCAPACITATED');
  });
});

describe('Counterspell resolution', () => {
  it('counters when the target fails its Constitution save against her DC', () => {
    expect(
      resolveCounterspell(scriptedDice([10]), { dc: 16, targetConSaveModifier: 1 }),
    ).toMatchObject({
      countered: true,
      save: { rolls: [10], total: 11, success: false },
    });
    expect(
      resolveCounterspell(scriptedDice([15]), { dc: 16, targetConSaveModifier: 1 }).countered,
    ).toBe(false);
  });

  it('spends her reaction and slot whether or not it succeeds', () => {
    const plan = checkCounterspell(elowen(), theirTurn(), shamanCasting, 3);
    if (!plan.legal) throw new Error(plan.reason);
    const after = applyCast(elowen(), theirTurn(), plan);
    expect(after.sheet.spellSlots.expended[2]).toBe(1);
    expect(after.turn.slotExpendedThisTurn).toBe(true);
  });
});
