import { beforeEach, describe, expect, it } from 'vitest';

import rulesSeed from '../../../../fixtures/ravenford/rules-seed.json' with { type: 'json' };
import {
  PLAYER,
  createHarness,
  expectAccepted,
  expectRejected,
  seedBasicWorld,
  type Harness,
} from '../kernel/testing/kernel-harness.ts';

let harness: Harness;
const sheet = rulesSeed.commands[0]?.sheet;

beforeEach(async () => {
  harness = createHarness();
  await seedBasicWorld(harness);
  expectAccepted(
    await harness.submit({
      type: 'CreateEntity',
      entityId: 'hero',
      kind: 'character',
      name: 'Hero',
      existsSince: null,
    }),
  );
});

const setSheet = (entityId: string, value: unknown = sheet) => ({
  type: 'SetCharacterSheet',
  entityId,
  sheet: value,
});

describe('SetCharacterSheet', () => {
  it('stores a valid sheet for characters, NPCs, and creatures only', async () => {
    expectAccepted(await harness.submit(setSheet('hero')));
    expect((await harness.state()).characterSheets.get('hero')?.armorClass).toBe(17);
    expectAccepted(await harness.submit(setSheet('npc')));
    expectRejected(await harness.submit(setSheet('lamp')), 'INVALID_ENTITY_DEFINITION');
    expectRejected(await harness.submit(setSheet('ghost')), 'ENTITY_NOT_FOUND');
  });

  it('rejects inconsistent sheets at the schema boundary', async () => {
    const base = sheet as Record<string, unknown>;
    for (const broken of [
      { ...base, hitPoints: { max: 10, current: 11 } },
      {
        ...base,
        spellSlots: { max: [1, 0, 0, 0, 0, 0, 0, 0, 0], expended: [2, 0, 0, 0, 0, 0, 0, 0, 0] },
      },
      { ...base, skills: { proficient: [], expertise: ['perception'] } },
      { ...base, speedFt: 32 },
      { ...base, spellcasting: [{ source: 'wizard', ability: 'int', spells: ['wish'] }] },
      { ...base, extra: true },
    ]) {
      expectRejected(await harness.submit(setSheet('hero', broken)), 'INVALID_COMMAND');
    }
  });

  it('is DM-only and undoable to the previous sheet', async () => {
    expectRejected(await harness.submit(setSheet('hero'), { actor: PLAYER }), 'FORBIDDEN');
    expectAccepted(await harness.submit(setSheet('hero'), { commandId: 'first' }));
    const wounded = { ...(sheet as Record<string, unknown>), hitPoints: { max: 78, current: 40 } };
    expectAccepted(await harness.submit(setSheet('hero', wounded), { commandId: 'second' }));
    expectRejected(
      await harness.submit({ type: 'UndoCommand', targetCommandId: 'first' }),
      'UNDO_UNSAFE',
    );
    expectAccepted(await harness.submit({ type: 'UndoCommand', targetCommandId: 'second' }));
    expect((await harness.state()).characterSheets.get('hero')?.hitPoints.current).toBe(78);
    expectAccepted(await harness.submit({ type: 'UndoCommand', targetCommandId: 'first' }));
    expect((await harness.state()).characterSheets.has('hero')).toBe(false);
  });
});
