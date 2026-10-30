import { describe, expect, it } from 'vitest';

import { resolvePerspective, controlledCharacter } from '@ltw/domain';

import { createHarness, expectAccepted } from '../../domain/src/kernel/testing/kernel-harness.ts';
import { bootstrapCommand, OWNER } from '../../domain/src/campaign/testing/bootstrap.ts';
import { gatherInputs } from './inputs.ts';

describe('context for prepared party seats', () => {
  it('uses canonical PARTY discoveries and members while actual control remains unassigned', async () => {
    const h = createHarness(),
      command = bootstrapCommand();
    expectAccepted(await h.submit(command, { actor: OWNER }));
    const state = await h.state(),
      member = command.identities.entities['alena'];
    if (!member) throw new Error('MEMBER_MISSING');
    const access = resolvePerspective(state, OWNER, { kind: 'CHARACTER', characterId: member });
    if (!access.ok) throw new Error('PERSPECTIVE_MISSING');
    const inputs = gatherInputs(state, access.perspective);
    expect(inputs?.scopeKey).toBe('PARTY');
    expect([...(inputs?.party ?? [])]).toEqual(
      command.content.party.map((key) => command.identities.entities[key]),
    );
    expect(
      inputs?.records.filter((record) => record.scope.kind === 'PARTY').length,
    ).toBeGreaterThan(0);
    expect(state.roster.size).toBe(0);
    expect(controlledCharacter(state, OWNER.actorId)).toBeNull();
    expect(
      resolvePerspective(
        state,
        { actorId: 'stranger', kind: 'user' },
        { kind: 'CHARACTER', characterId: member },
      ).ok,
    ).toBe(false);
  });
});
