import type { CommandResult } from '@ltw/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  CAMPAIGN,
  DM,
  PLAYER,
  createHarness,
  expectAccepted,
  seedBasicWorld,
  type Harness,
} from '../testing/kernel-harness.ts';
import { mulberry32, randomCommand } from '../testing/random-commands.ts';
import { previewUndo, type UndoPreview } from './undo-preview.ts';

/**
 * Whether undo is possible now (docs/adr/0033-live-session.md §7): the World Engine's own
 * authorization and decision of `UndoCommand`, made against a snapshot without committing.
 * It must answer exactly what submitting the undo would, and change nothing.
 */
let harness: Harness;

beforeEach(async () => {
  harness = createHarness();
  await seedBasicWorld(harness);
});

const preview = async (target: string, actor = DM): Promise<UndoPreview> =>
  previewUndo(await harness.snapshot(), actor, CAMPAIGN, target);

/** What submitting the undo answered, in the preview's terms. */
function submitted(result: CommandResult): UndoPreview {
  if (result.status !== 'rejected') return { undoable: true };
  const blockers = result.details?.['blockers'];
  return {
    undoable: false,
    code: result.code,
    blockers: Array.isArray(blockers) ? (blockers as never[]) : [],
  };
}

describe('previewUndo', () => {
  it('says a standing command with nothing depending on it can be undone', async () => {
    expectAccepted(
      await harness.submit(
        { type: 'PlaceEntity', entityId: 'npc', locationId: 'inn' },
        {
          commandId: 'move',
        },
      ),
    );
    expect(await preview('move')).toEqual({ undoable: true });
  });

  it('lists the later commands an undo would be refused for, as the engine does', async () => {
    expectAccepted(
      await harness.submit(
        { type: 'CreateEntity', entityId: 'tom', kind: 'npc', name: 'Tom', existsSince: null },
        { commandId: 'create' },
      ),
    );
    expectAccepted(
      await harness.submit(
        { type: 'PlaceEntity', entityId: 'tom', locationId: 'inn' },
        {
          commandId: 'place',
        },
      ),
    );
    const before = await preview('create');
    expect(before).toEqual({
      undoable: false,
      code: 'UNDO_UNSAFE',
      blockers: [
        { commandId: 'place', commandType: 'PlaceEntity', sequence: expect.any(Number) as number },
      ],
    });
    const refused = await harness.submit(
      { type: 'UndoCommand', targetCommandId: 'create' },
      { commandId: 'undo-create' },
    );
    expect(submitted(refused)).toEqual(before);

    expectAccepted(
      await harness.submit(
        { type: 'UndoCommand', targetCommandId: 'place' },
        {
          commandId: 'undo-place',
        },
      ),
    );
    expect(await preview('create')).toEqual({ undoable: true });
  });

  it('answers the engine’s refusals for undone, unknown and permanent commands', async () => {
    expectAccepted(
      await harness.submit({ type: 'AdvanceWorldTime', by: 60 }, { commandId: 'tick' }),
    );
    expectAccepted(
      await harness.submit(
        { type: 'UndoCommand', targetCommandId: 'tick' },
        {
          commandId: 'untick',
        },
      ),
    );
    expect(await preview('tick')).toMatchObject({ undoable: false, code: 'ALREADY_UNDONE' });
    expect(await preview('nothing')).toMatchObject({ undoable: false, code: 'COMMAND_NOT_FOUND' });
    expect(await preview('untick')).toMatchObject({ undoable: false, code: 'UNDO_NOT_SUPPORTED' });
  });

  it('never grants an undo to anyone but the DM', async () => {
    expectAccepted(
      await harness.submit(
        { type: 'PlaceEntity', entityId: 'npc', locationId: 'inn' },
        {
          commandId: 'move',
        },
      ),
    );
    expect(await preview('move', PLAYER)).toEqual({
      undoable: false,
      code: 'FORBIDDEN',
      blockers: [],
    });
  });

  it('commits nothing', async () => {
    expectAccepted(
      await harness.submit(
        { type: 'PlaceEntity', entityId: 'npc', locationId: 'inn' },
        {
          commandId: 'move',
        },
      ),
    );
    const before = await harness.snapshot();
    await preview('move');
    await preview('nothing');
    const after = await harness.snapshot();
    expect(after.state.version).toBe(before.state.version);
    expect(after.history).toBe(before.history);
    expect(await harness.store.findCommand('move')).not.toBeNull();
    expect((await harness.store.loadCommands(CAMPAIGN)).length).toBe(before.state.commands.size);
  });

  it.each([3, 11, 2026])(
    'agrees with submitting the undo over randomized histories (seed %i)',
    async (seed) => {
      const rng = mulberry32(seed);
      const accepted: string[] = [];
      let compared = 0;
      for (let step = 0; step < 160; step += 1) {
        const state = await harness.state();
        const commandId = `p${String(seed)}-${String(step)}`;
        const generated = randomCommand(rng, state, accepted, step);
        // Every eighth step also tries to undo an earlier command, often one others rest on.
        const command =
          step % 8 === 7 && accepted.length > 0
            ? {
                type: 'UndoCommand',
                targetCommandId: accepted[Math.floor(rng() * accepted.length)],
              }
            : generated;
        if (command['type'] === 'UndoCommand') {
          const target = String(command['targetCommandId']);
          const expected = await preview(target);
          const version = (await harness.state()).version;
          const result = await harness.submit(command, { commandId });
          if (result.status === 'rejected') expect((await harness.state()).version).toBe(version);
          expect(submitted(result), `${target} at step ${String(step)}`).toEqual(expected);
          compared += 1;
          if (result.status !== 'rejected') accepted.push(commandId);
        } else if ((await harness.submit(command, { commandId })).status !== 'rejected') {
          accepted.push(commandId);
        }
      }
      expect(compared).toBeGreaterThan(20);
    },
  );
});
