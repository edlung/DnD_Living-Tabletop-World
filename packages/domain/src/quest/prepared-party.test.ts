import { describe, expect, it } from 'vitest';

import { buildCampaignBootstrapPlan } from '../campaign/bootstrap-plan.ts';
import { bootstrapCommand, OWNER } from '../campaign/testing/bootstrap.ts';
import { resolvePerspective } from '../knowledge/perspective.ts';
import { createHarness, expectAccepted } from '../kernel/testing/kernel-harness.ts';
import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import { redecideEffective } from '../kernel/verification/redecide.ts';
import { questLog } from './projection.ts';

describe('prepared party quest occurrences', () => {
  it('counts real actions after prepared membership, never the initial placements, without inventing a controller', async () => {
    const h = createHarness(),
      command = bootstrapCommand();
    command.content.quests = [
      {
        questId: 'prepared-journey',
        title: 'A prepared journey',
        activation: { subject: 'sluice-journal', summary: 'Find the journal.' },
        milestones: [
          {
            kind: 'reached',
            stage: 'dock-reached',
            locationId: 'dock',
            summary: 'Visit the dock.',
          },
          {
            kind: 'reached',
            stage: 'harbor-reached',
            locationId: 'harbor',
            summary: 'Visit the harbor.',
          },
          {
            kind: 'examined-at',
            stage: 'harbor-examined',
            locationId: 'harbor',
            summary: 'Inspect the harbor.',
          },
        ],
      },
    ];
    expectAccepted(await h.submit(command, { actor: OWNER, commandId: 'boot' }));
    const quests = buildCampaignBootstrapPlan(
        command.content,
        command.identities,
        [],
        'TEXT_ONLY',
      ).quests,
      characterId = command.identities.entities['alena'],
      harbor = command.identities.entities['harbor'];
    if (!characterId || !harbor) throw new Error('TEST_IDENTITIES');
    const stages = async () => {
      const snapshot = await h.snapshot(),
        access = resolvePerspective(snapshot.state, OWNER, { kind: 'CHARACTER', characterId });
      if (!access.ok) throw new Error('TEST_PERSPECTIVE');
      return questLog(snapshot, access.perspective, quests)[0]?.transitions.map(
        (transition) => transition.stage,
      );
    };
    expect(await stages()).toEqual(['activated']);
    expect((await h.state()).roster.size).toBe(0);
    expectAccepted(
      await h.submit(
        { type: 'EnterLocation', characterId, locationId: harbor },
        { actor: OWNER, commandId: 'enter' },
      ),
    );
    expect(await stages()).toEqual(['activated', 'harbor-reached']);
    expectAccepted(
      await h.submit(
        { type: 'ExamineEntity', characterId, entityId: harbor, method: 'inspect' },
        { actor: OWNER, commandId: 'examine' },
      ),
    );
    expect(await stages()).toEqual(['activated', 'harbor-reached', 'harbor-examined']);
    expectAccepted(
      await h.submit({ type: 'UndoCommand', targetCommandId: 'examine' }, { actor: OWNER }),
    );
    expect(await stages()).toEqual(['activated', 'harbor-reached']);
    const snapshot = await h.snapshot();
    expect(checkWorldIntegrity(snapshot.state)).toEqual([]);
    expect(
      redecideEffective(await h.engine.commandLog('test-campaign'), snapshot, () => 3),
    ).toBeNull();
  });
});
