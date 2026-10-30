import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { MemoryWorkshopStore } from '../testing/workshop-store.ts';
import { parseWorkshopOperatorArgs, runWorkshopOperatorCommand } from './operator.ts';

describe('workshop operator authorization', () => {
  it('requires explicit source, validates flags and never echoes untrusted arguments', () => {
    const owner = randomUUID();
    const valid = [
      'invite',
      '--owner',
      owner,
      '--expires-hours',
      '24',
      '--authorization-source',
      'chat:380',
    ];
    expect(parseWorkshopOperatorArgs(valid)).toEqual({
      kind: 'invite',
      ownerId: owner,
      hours: 24,
      authorizationSource: 'chat:380',
    });
    for (const args of [
      [],
      ['revoke'],
      valid.slice(0, -2),
      [...valid, '--owner', owner],
      ['invite', '--expires-hours', '169', '--authorization-source', 'chat:380'],
      ['revoke', '--owner', owner, '--authorization-source', 'line\nforged'],
      ['invite', '--unknown-secret', 'never-echo'],
    ]) {
      expect(() => parseWorkshopOperatorArgs(args)).toThrow();
      try {
        parseWorkshopOperatorArgs(args);
      } catch (error) {
        expect(String(error)).not.toContain('never-echo');
      }
    }
  });

  it('issues a fresh owner grant once, records its source and revokes all open grants', async () => {
    const store = new MemoryWorkshopStore();
    const deps = {
      store,
      publicOrigin: 'https://table.example',
      clock: { now: () => Date.parse('2026-10-30T10:00:00Z') },
    };
    const command = parseWorkshopOperatorArgs([
      'invite',
      '--expires-hours',
      '24',
      '--authorization-source',
      'chat:380',
    ]);
    const issued = await runWorkshopOperatorCommand(deps, command);
    expect(issued).toHaveProperty('ownerId', command.ownerId);
    expect((issued as { link: string }).link).toMatch(/\/workshop\/join#[A-Za-z0-9_-]{43}$/);
    expect([...store.invitations.values()][0]?.authorizationSource).toBe('chat:380');
    await runWorkshopOperatorCommand(deps, {
      kind: 'revoke',
      ownerId: command.ownerId,
      authorizationSource: 'chat:lost-device',
    });
    expect([...store.invitations.values()].every((invite) => invite.revoked)).toBe(true);
    expect(JSON.stringify([...store.invitations.values()])).not.toContain(
      (issued as { link: string }).link.split('#')[1],
    );
  });
});
