import { beforeEach, describe, expect, it } from 'vitest';

import {
  PLAYER,
  createHarness,
  expectAccepted,
  expectRejected,
  seedBasicWorld,
  type Harness,
} from '../kernel/testing/kernel-harness.ts';
import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import { resolvePerspective } from '../knowledge/perspective.ts';
import { handQuestsView } from './hand-quests.ts';

/**
 * Quests by hand (docs/adr/0058-campaign-content.md §2): the DM writes "The miller's cellar", known
 * to the party, and "The hidden debt", the DM's alone; the hero's journal shows the first only; a
 * step ticked shows; a quest taken away goes; each change is undone.
 */
let harness: Harness;

const quest = (title: string, known: boolean) => ({
  title,
  summary: 'Something stirs below the mill.',
  steps: [
    { text: 'Find the cellar door', done: false },
    { text: 'See what lies below', done: false },
  ],
  known,
});

beforeEach(async () => {
  harness = createHarness();
  await seedBasicWorld(harness);
  for (const command of [
    {
      type: 'CreateEntity',
      entityId: 'hero',
      kind: 'character',
      name: 'hero',
      existsSince: null,
      placement: { locationId: 'square', since: null },
    },
    { type: 'AssignCharacter', characterId: 'hero', playerActorId: PLAYER.actorId },
  ])
    expectAccepted(await harness.submit(command));
});

async function heroQuests() {
  const state = await harness.state();
  const access = resolvePerspective(state, PLAYER, { kind: 'PLAYER' });
  if (!access.ok) throw new Error(access.reason);
  return handQuestsView(state, access.perspective);
}

describe('quests by hand', () => {
  it('are the DM’s to write, and the party sees the known ones', async () => {
    expectRejected(
      await harness.submit(
        { type: 'SetQuest', questId: 'quest-mill', quest: quest("The miller's cellar", true) },
        { actor: PLAYER },
      ),
      'FORBIDDEN',
    );
    for (const command of [
      { type: 'SetQuest', questId: 'quest-mill', quest: quest("The miller's cellar", true) },
      { type: 'SetQuest', questId: 'quest-debt', quest: quest('The hidden debt', false) },
    ])
      expectAccepted(await harness.submit(command));
    expect((await heroQuests()).map((one) => one.title)).toEqual(["The miller's cellar"]);
    expectAccepted(
      await harness.submit({ type: 'SetQuestStep', questId: 'quest-mill', step: 0, done: true }),
    );
    expectRejected(
      await harness.submit({ type: 'SetQuestStep', questId: 'quest-mill', step: 0, done: true }),
      'NO_EFFECT',
    );
    expectRejected(
      await harness.submit({ type: 'SetQuestStep', questId: 'quest-mill', step: 5, done: true }),
      'NOT_PRESENT',
    );
    const [mill] = await heroQuests();
    expect(mill?.steps.map((one) => one.done)).toEqual([true, false]);
    expect(mill?.completed).toBe(false);
    expect(checkWorldIntegrity(await harness.state())).toEqual([]);
  });

  it('is taken away, and every change undone', async () => {
    const written = expectAccepted(
      await harness.submit({
        type: 'SetQuest',
        questId: 'quest-mill',
        quest: quest("The miller's cellar", true),
      }),
    );
    const ticked = expectAccepted(
      await harness.submit({ type: 'SetQuestStep', questId: 'quest-mill', step: 1, done: true }),
    );
    expectAccepted(
      await harness.submit({ type: 'UndoCommand', targetCommandId: ticked.commandId }),
    );
    expect((await heroQuests())[0]?.steps[1]?.done).toBe(false);
    expectAccepted(await harness.submit({ type: 'SetQuest', questId: 'quest-mill', quest: null }));
    expect(await heroQuests()).toEqual([]);
    // Taking it away holds the writing: undone newest first.
    expectRejected(
      await harness.submit({ type: 'UndoCommand', targetCommandId: written.commandId }),
      'UNDO_UNSAFE',
    );
  });
});
