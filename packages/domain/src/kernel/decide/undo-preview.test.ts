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

/** An answer, or what was thrown instead: a throw is never an answer to agree with. */
async function settled<T>(work: () => Promise<T>): Promise<{ value: T } | { threw: unknown }> {
  try {
    return { value: await work() };
  } catch (error) {
    return { threw: error };
  }
}

/** One authoring commit that creates an NPC and then edits him (ADR 0018), under new names. */
const authoredNpc = (step: number) => {
  const entityId = `npc${String(step)}`;
  return {
    type: 'ApplyAuthoring',
    proposalId: `00000000-0000-4000-8000-${String(step).padStart(12, '0')}`,
    revision: 1,
    summary: 'A guard, renamed at once.',
    source: { kind: 'dm' },
    commands: [
      {
        type: 'CreateEntity',
        entityId,
        kind: 'npc',
        name: `Guard ${String(step)}`,
        existsSince: null,
      },
      {
        type: 'UpdateEntityProfile',
        entityId,
        name: `Tomas ${String(step)}`,
        description: 'A guard',
      },
    ],
    confirmation: { riskLevel: 'L2', acknowledgedWarnings: [] },
  };
};

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
      let authoredUndone = 0;
      // The authoring commit of the step before, while nothing can rest on it yet.
      let authored: string | null = null;
      for (let step = 0; step < 160; step += 1) {
        const state = await harness.state();
        const commandId = `p${String(seed)}-${String(step)}`;
        const generated = randomCommand(rng, state, accepted, step);
        const fresh = authored;
        authored = null;
        // Every eighth step also tries to undo an earlier command, often one others rest on.
        // Every eighth from the fourth, an authoring commit creates an NPC and edits him, so
        // undo meets facets of an entity its own command created; every other one is undone
        // at once, which must succeed.
        const target =
          fresh !== null && step % 16 === 4
            ? fresh
            : step % 8 === 7 && accepted.length > 0
              ? accepted[Math.floor(rng() * accepted.length)]
              : undefined;
        if (target !== undefined) {
          const at = `${target} at step ${String(step)}`;
          const version = (await harness.state()).version;
          const expected = await settled(() => preview(target));
          const result = await settled(() =>
            harness.submit({ type: 'UndoCommand', targetCommandId: target }, { commandId }),
          );
          // Only answers can agree: a decision that throws fails here, on one side or both.
          if ('threw' in expected || 'threw' in result) {
            const sides = [
              ...('threw' in expected ? ['the preview'] : []),
              ...('threw' in result ? ['the undo'] : []),
            ];
            throw new Error(`${at}: ${sides.join(' and ')} threw instead of answering`, {
              cause: 'threw' in expected ? expected.threw : 'threw' in result ? result.threw : null,
            });
          }
          if (result.value.status === 'rejected') {
            expect((await harness.state()).version).toBe(version);
          }
          expect(submitted(result.value), at).toEqual(expected.value);
          if (target === fresh) {
            expect(expected.value, `${at}: nothing rests on it`).toEqual({ undoable: true });
            authoredUndone += 1;
          }
          compared += 1;
          if (result.value.status !== 'rejected') accepted.push(commandId);
          continue;
        }
        const authoring = step % 8 === 3;
        const command = authoring ? authoredNpc(step) : generated;
        if ((await harness.submit(command, { commandId })).status !== 'rejected') {
          accepted.push(commandId);
          if (authoring) authored = commandId;
        }
      }
      expect(compared).toBeGreaterThan(20);
      expect(authoredUndone).toBeGreaterThan(0);
    },
  );
});
