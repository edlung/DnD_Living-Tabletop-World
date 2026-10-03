import { describe, expect, it } from 'vitest';

import { applyCast, checkCast, type CastRequest } from './casting.ts';
import { elowen, myTurn, theirTurn } from './testing/elowen.ts';
import type { TurnState } from './turn.ts';

const near = { distanceFt: 30, visible: true };
const cast = (request: CastRequest, turn: TurnState = myTurn(), sheet = elowen()) =>
  checkCast(sheet, turn, request);
const reason = (result: ReturnType<typeof checkCast>) => (result.legal ? 'LEGAL' : result.reason);

describe('range', () => {
  it.each([
    ['healing-word', 60, 1],
    ['hunters-mark', 90, 1],
    ['fireball', 150, 3],
  ] as const)('%s reaches exactly %i ft and no farther', (spellId, rangeFt, slotLevel) => {
    expect(
      reason(
        cast({ spellId, using: { slotLevel }, target: { distanceFt: rangeFt, visible: true } }),
      ),
    ).toBe('LEGAL');
    const far = cast({
      spellId,
      using: { slotLevel },
      target: { distanceFt: rangeFt + 5, visible: true },
    });
    expect(far).toEqual({
      legal: false,
      reason: 'OUT_OF_RANGE',
      resolution: { moveRequiredFt: 5 },
    });
  });

  it('reports how far to move, rounded up to whole squares (spec context contract)', () => {
    const result = cast({
      spellId: 'healing-word',
      using: 'free',
      target: { distanceFt: 70, visible: true },
    });
    expect(result).toEqual({
      legal: false,
      reason: 'OUT_OF_RANGE',
      resolution: { moveRequiredFt: 10 },
    });
  });

  it('requires visible targets for targeted spells', () => {
    expect(
      reason(
        cast({
          spellId: 'healing-word',
          using: 'free',
          target: { distanceFt: 10, visible: false },
        }),
      ),
    ).toBe('TARGET_NOT_VISIBLE');
    expect(reason(cast({ spellId: 'hunters-mark', using: 'free' }))).toBe('TARGET_REQUIRED');
  });

  it('limits Misty Step to 30 ft to a visible, unoccupied space', () => {
    const step = (distanceFt: number, visible = true, occupied = false) =>
      reason(
        cast({
          spellId: 'misty-step',
          using: { slotLevel: 2 },
          destination: { distanceFt, visible, occupied },
        }),
      );
    expect(step(30)).toBe('LEGAL');
    expect(step(35)).toBe('OUT_OF_RANGE');
    expect(step(10, false)).toBe('DESTINATION_INVALID');
    expect(step(10, true, true)).toBe('DESTINATION_INVALID');
  });
});

describe('spell slots and slot-free casts', () => {
  it('needs a slot of at least the spell level, and an unexpended one', () => {
    expect(reason(cast({ spellId: 'fireball', using: { slotLevel: 2 }, target: near }))).toBe(
      'SLOT_TOO_LOW',
    );
    expect(reason(cast({ spellId: 'fireball', using: { slotLevel: 7 }, target: near }))).toBe(
      'NO_SLOT',
    );
    const spent = elowen({
      spellSlots: { max: [4, 3, 3, 3, 2, 1, 0, 0, 0], expended: [0, 0, 3, 0, 0, 0, 0, 0, 0] },
    });
    expect(
      reason(cast({ spellId: 'fireball', using: { slotLevel: 3 }, target: near }, myTurn(), spent)),
    ).toBe('NO_SLOT');
    expect(
      reason(cast({ spellId: 'fireball', using: { slotLevel: 4 }, target: near }, myTurn(), spent)),
    ).toBe('LEGAL');
  });

  it('expends the chosen slot', () => {
    const plan = cast({ spellId: 'fireball', using: { slotLevel: 5 }, target: near });
    if (!plan.legal) throw new Error(plan.reason);
    const { sheet } = applyCast(elowen(), myTurn(), plan);
    expect(sheet.spellSlots.expended).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0]);
  });

  it('allows three slot-free Hunter’s Marks and one slot-free Healing Word per Long Rest', () => {
    let sheet = elowen();
    for (let use = 0; use < 3; use += 1) {
      const plan = checkCast(sheet, myTurn(), {
        spellId: 'hunters-mark',
        using: 'free',
        target: near,
      });
      if (!plan.legal) throw new Error(plan.reason);
      sheet = applyCast(sheet, myTurn(), plan).sheet;
    }
    expect(
      reason(checkCast(sheet, myTurn(), { spellId: 'hunters-mark', using: 'free', target: near })),
    ).toBe('NO_FREE_CAST');
    expect(sheet.spellSlots.expended.every((n) => n === 0)).toBe(true);

    const heal = checkCast(sheet, myTurn(), {
      spellId: 'healing-word',
      using: 'free',
      target: near,
    });
    if (!heal.legal) throw new Error(heal.reason);
    expect(heal.source.source).toBe('magic-initiate');
    const healed = applyCast(sheet, myTurn(), heal).sheet;
    expect(
      reason(checkCast(healed, myTurn(), { spellId: 'healing-word', using: 'free', target: near })),
    ).toBe('NO_FREE_CAST');
    expect(
      reason(
        checkCast(healed, myTurn(), {
          spellId: 'healing-word',
          using: { slotLevel: 1 },
          target: near,
        }),
      ),
    ).toBe('LEGAL');
  });

  it('refuses spells the character does not have', () => {
    const noWizard = elowen({
      spellcasting: elowen().spellcasting.filter((s) => s.source !== 'wizard'),
    });
    expect(
      reason(
        cast({ spellId: 'fireball', using: { slotLevel: 3 }, target: near }, myTurn(), noWizard),
      ),
    ).toBe('NOT_KNOWN');
  });
});

describe('action economy and one slot per turn', () => {
  it('spends the action, bonus action, and the one slot of the turn', () => {
    const fireball = cast({ spellId: 'fireball', using: { slotLevel: 3 }, target: near });
    if (!fireball.legal) throw new Error(fireball.reason);
    const after = applyCast(elowen(), myTurn(), fireball);
    expect(
      reason(
        checkCast(after.sheet, after.turn, {
          spellId: 'fireball',
          using: { slotLevel: 4 },
          target: near,
        }),
      ),
    ).toBe('NO_ACTION');
    expect(
      reason(
        checkCast(after.sheet, after.turn, {
          spellId: 'misty-step',
          using: { slotLevel: 2 },
          destination: { distanceFt: 10, visible: true, occupied: false },
        }),
      ),
    ).toBe('SLOT_ALREADY_USED_THIS_TURN');
    expect(
      reason(
        checkCast(after.sheet, after.turn, {
          spellId: 'hunters-mark',
          using: 'free',
          target: near,
        }),
      ),
    ).toBe('LEGAL');
  });

  it('allows only one bonus action, and no actions or bonus actions off-turn', () => {
    const mark = cast({ spellId: 'hunters-mark', using: 'free', target: near });
    if (!mark.legal) throw new Error(mark.reason);
    const after = applyCast(elowen(), myTurn(), mark);
    expect(
      reason(
        checkCast(after.sheet, after.turn, {
          spellId: 'healing-word',
          using: 'free',
          target: near,
        }),
      ),
    ).toBe('NO_BONUS_ACTION');
    expect(
      reason(cast({ spellId: 'fireball', using: { slotLevel: 3 }, target: near }, theirTurn())),
    ).toBe('NOT_YOUR_TURN');
    expect(
      reason(cast({ spellId: 'healing-word', using: 'free', target: near }, theirTurn())),
    ).toBe('NOT_YOUR_TURN');
  });

  it('forbids casting while Incapacitated', () => {
    const stunned = elowen({ conditions: ['incapacitated'] });
    expect(
      reason(cast({ spellId: 'healing-word', using: 'free', target: near }, myTurn(), stunned)),
    ).toBe('INCAPACITATED');
  });
});

describe('concentration on casting', () => {
  it('starting a new Concentration spell ends the current one', () => {
    const mark = cast({ spellId: 'hunters-mark', using: 'free', target: near });
    if (!mark.legal) throw new Error(mark.reason);
    expect(mark.endsConcentration).toBeNull();
    const marked = applyCast(elowen(), myTurn(), mark).sheet;
    expect(marked.concentration).toEqual({ spellId: 'hunters-mark' });

    const detect = checkCast(marked, myTurn(), {
      spellId: 'detect-magic',
      using: { slotLevel: 1 },
    });
    if (!detect.legal) throw new Error(detect.reason);
    expect(detect.endsConcentration).toBe('hunters-mark');
    expect(applyCast(marked, myTurn(), detect).sheet.concentration).toEqual({
      spellId: 'detect-magic',
    });
  });

  it('non-Concentration spells leave Concentration alone', () => {
    const marked = elowen({ concentration: { spellId: 'hunters-mark' } });
    const fireball = checkCast(marked, myTurn(), {
      spellId: 'fireball',
      using: { slotLevel: 3 },
      target: near,
    });
    if (!fireball.legal) throw new Error(fireball.reason);
    expect(fireball.endsConcentration).toBeNull();
    expect(applyCast(marked, myTurn(), fireball).sheet.concentration).toEqual({
      spellId: 'hunters-mark',
    });
  });
});
