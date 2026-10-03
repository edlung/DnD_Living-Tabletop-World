import type { CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { ELOWEN, SHAMAN, codeOf, roadWorld, startAmbush } from './testing/road.ts';

/** `MoveCombatant` (ADR 0015 §3): Elowen starts at (2,6); the ditch (y = 9) is difficult. */
const reason = (result: CommandResult) =>
  result.status === 'rejected' ? (result.details?.['reason'] ?? result.code) : result.status;
/** `move('3,6 4,7')`: the squares entered, in order. */
const move = (path: string, combatantId = ELOWEN) => ({
  type: 'MoveCombatant',
  combatantId,
  path: path.split(' ').map((square) => {
    const [x, y] = square.split(',').map(Number);
    return { x, y };
  }),
});

describe('movement', () => {
  it('moves square by square and spends movement', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const moved = await world.submit(move('3,6 4,7'));
    expect(moved.status === 'accepted' && moved.outcome).toEqual({
      kind: 'MoveCombatant',
      position: { x: 4, y: 7 },
    });
    const elowen = (await world.encounter()).combatants[0];
    expect(elowen).toMatchObject({ position: { x: 4, y: 7 }, turn: { movementUsedFt: 10 } });
    // 20 ft left: five more squares are too many, four are exactly enough.
    expect(reason(await world.submit(move('5,7 6,7 7,7 8,7 9,8')))).toBe('NOT_ENOUGH_MOVEMENT');
    expect(codeOf(await world.submit(move('5,7 6,7 7,7 8,7')))).toBe('accepted');
  });

  it('charges double for difficult terrain', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await world.submit(move('2,7 2,8 2,9'));
    expect((await world.encounter()).combatants[0]?.turn.movementUsedFt).toBe(20);
    expect(reason(await world.submit(move('2,10 3,11 4,11')))).toBe('NOT_ENOUGH_MOVEMENT');
  });

  it('refuses gaps, occupied squares, and squares off the battlefield', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    expect(reason(await world.submit(move('4,6')))).toBe('INVALID_PATH');
    expect(codeOf(await world.submit(move('1,6 0,6 -1,6')))).toBe('INVALID_COMMAND');
    await world.dm({ type: 'EndTurn', combatantId: ELOWEN });
    // The Shaman (12,6) cannot end on Raider 2 (10,7) or leave the 16-wide field.
    expect(reason(await world.dm(move('11,7 10,7', SHAMAN)))).toBe('INVALID_PATH');
    expect(reason(await world.dm(move('13,6 14,6 15,6 16,6', SHAMAN)))).toBe('INVALID_PATH');
    expect(codeOf(await world.dm(move('13,6 14,6', SHAMAN)))).toBe('accepted');
  });

  it('only moves the combatant whose turn it is', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    expect(codeOf(await world.dm(move('13,6', SHAMAN)))).toBe('NOT_YOUR_TURN');
  });
});
