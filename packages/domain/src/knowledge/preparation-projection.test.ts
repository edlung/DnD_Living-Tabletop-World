import { beforeAll, describe, expect, it } from 'vitest';

import type { WorldState } from '../kernel/state.ts';
import { campaignRole, holderPerspective, resolvePerspective } from './perspective.ts';
import { knownEntityIds } from './projection.ts';
import { projectionPartyMemberIds } from './projection-party.ts';
import { DM, OUTSIDER, PLAYER, seedRavenford } from './testing/ravenford.ts';

let state: WorldState;
beforeAll(async () => {
  ({ state } = await seedRavenford());
});
const characterId = 'elowen-starwhisper';

describe('trusted preparation party projection without membership', () => {
  it('supplies party knowledge and prepared identities without assigning a controller', () => {
    const character = state.entities.get(characterId);
    if (!character) throw new Error('missing character');
    const prepared = {
      ...state,
      roster: new Map<string, string>(),
      entities: new Map(state.entities).set('prepared-second', {
        ...character,
        entityId: 'prepared-second',
      }),
    };
    const memberIds = new Set([characterId, 'prepared-second', 'mira-vale', 'absent']);
    const access = resolvePerspective(
      prepared,
      DM,
      { kind: 'CHARACTER', characterId },
      { memberIds },
    );
    if (!access.ok) throw new Error('preview denied');
    expect(access.perspective.scopes).toEqual(
      new Set(['PUBLIC', `CHARACTER:${characterId}`, 'PARTY']),
    );
    expect(projectionPartyMemberIds(prepared, access.perspective)).toEqual(
      new Set([characterId, 'prepared-second']),
    );
    expect(knownEntityIds(prepared, access.perspective).has('prepared-second')).toBe(true);
    memberIds.clear();
    expect(access.perspective.partyMemberIds?.size).toBe(2);
    expect(prepared.roster.size).toBe(0);
    expect(campaignRole(prepared, PLAYER)).toBeNull();
    expect(campaignRole(prepared, { kind: 'user', actorId: 'prepared-second' })).toBeNull();
    expect(resolvePerspective(prepared, PLAYER, { kind: 'PARTY' }, { memberIds })).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    });
  });

  it('ignores a supplied override for actual players and refuses outsiders before target lookup', () => {
    const request = { kind: 'CHARACTER', characterId } as const;
    const ordinary = resolvePerspective(state, PLAYER, request);
    const overridden = resolvePerspective(state, PLAYER, request, { memberIds: new Set() });
    expect(overridden).toEqual(ordinary);
    expect(
      resolvePerspective(state, OUTSIDER, request, { memberIds: new Set([characterId]) }),
    ).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    });
    expect(
      resolvePerspective(
        state,
        PLAYER,
        { kind: 'CHARACTER', characterId: 'absent' },
        {
          memberIds: new Set(['absent']),
        },
      ),
    ).toEqual({ ok: false, reason: 'FORBIDDEN' });
  });

  it('does not grant party knowledge to NPC or unprepared character perspectives', () => {
    const prepared = { ...state, roster: new Map<string, string>() };
    const context = { memberIds: new Set(['mira-vale']) };
    const own = holderPerspective(prepared, { kind: 'CHARACTER', characterId }, context);
    expect(own.scopes).toEqual(new Set(['PUBLIC', `CHARACTER:${characterId}`]));
    expect(
      holderPerspective(prepared, { kind: 'NPC', npcId: 'mira-vale' }, context).scopes,
    ).toEqual(new Set(['PUBLIC', 'NPC:mira-vale']));
  });
});
