import { describe, expect, it } from 'vitest';

import { replay } from '../kernel/evolve.ts';
import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import { redecideEffective } from '../kernel/verification/redecide.ts';
import {
  CAMPAIGN,
  DM,
  ELOWEN,
  MODIFIERS,
  codeOf,
  investigationWorld,
  type InvestigationWorld,
} from './testing/world.ts';

/**
 * Results that found nothing still depend on why (Gate 03 remediation,
 * adjacent to G03-H02): an inspection that skipped a clue the scope had
 * already found relied on that discovery, so undoing it while the later
 * inspection stands is UNDO_UNSAFE.
 */
async function consistent(world: InvestigationWorld) {
  const snapshot = await world.engine.load(CAMPAIGN);
  if (!snapshot) throw new Error('missing campaign');
  expect(replay(snapshot.history)).toEqual(snapshot.state);
  expect(checkWorldIntegrity(snapshot.state)).toEqual([]);
  const log = await world.engine.commandLog(CAMPAIGN);
  expect(redecideEffective(log, snapshot, (_sheet, skill) => MODIFIERS[skill] ?? 0)).toBeNull();
}

describe('negative premises of examinations', () => {
  it('a repeated inspection blocks undoing the first one; reverse order works', async () => {
    const world = await investigationWorld();
    for (const locationId of ['old-trade-road', 'abandoned-caravan-site']) {
      await world.submit({ type: 'EnterLocation', characterId: ELOWEN, locationId });
    }
    const inspect = {
      type: 'ExamineEntity',
      characterId: ELOWEN,
      entityId: 'broken-wagon-wheel',
      method: 'inspect',
    };
    const first = await world.submit(inspect);
    const second = await world.submit(inspect);
    expect(second.status === 'accepted' && second.outcome).toMatchObject({ discovered: [] });
    const refused = await world.submit(
      { type: 'UndoCommand', targetCommandId: first.commandId },
      DM,
    );
    expect(codeOf(refused)).toBe('UNDO_UNSAFE');
    expect(
      refused.status === 'rejected' &&
        (refused.details?.['blockers'] as { commandId: string }[]).map((b) => b.commandId),
    ).toEqual([second.commandId]);
    await consistent(world);
    expect(
      codeOf(await world.submit({ type: 'UndoCommand', targetCommandId: second.commandId }, DM)),
    ).toBe('accepted');
    expect(
      codeOf(await world.submit({ type: 'UndoCommand', targetCommandId: first.commandId }, DM)),
    ).toBe('accepted');
    await consistent(world);
  });
});
