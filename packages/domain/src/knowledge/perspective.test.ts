import { parsePerspective, type PerspectiveRequest } from '@ltw/contracts';
import { beforeAll, describe, expect, it } from 'vitest';

import type { WorldState } from '../kernel/state.ts';
import { campaignRole, controlledCharacters, resolvePerspective } from './perspective.ts';
import { campaignSession } from './session.ts';
import { ASHEN_CIRCLE_ID, DM, OUTSIDER, PLAYER, seedRavenford } from './testing/ravenford.ts';

let state: WorldState;

beforeAll(async () => {
  ({ state } = await seedRavenford());
});

const request = (raw: string): PerspectiveRequest => {
  const parsed = parsePerspective(raw);
  if (!parsed) throw new Error(`unparseable ${raw}`);
  return parsed;
};

describe('parsePerspective', () => {
  it.each(['DM', 'PUBLIC', 'PARTY', 'PLAYER', 'CHARACTER:elowen-starwhisper', 'NPC:mira-vale'])(
    'accepts %s',
    (raw) => {
      expect(parsePerspective(raw)).not.toBeNull();
    },
  );

  it.each([
    '',
    'dm',
    'Dm',
    ' DM',
    'DM ',
    'WORLD_TRUTH',
    'NPC',
    'NPC:',
    'NPC:Mira',
    'NPC:mira-vale:extra',
    'CHARACTER:../dm',
    'PARTY,DM',
    'ALL',
    '*',
    'null',
  ])('rejects %j', (raw) => {
    expect(parsePerspective(raw)).toBeNull();
  });

  it.each([undefined, null, 42, ['DM'], { kind: 'DM' }])('rejects non-string %j', (raw) => {
    expect(parsePerspective(raw)).toBeNull();
  });
});

describe('campaign roles', () => {
  it('derives roles from canonical state only', () => {
    expect(campaignRole(state, DM)).toBe('DM');
    expect(campaignRole(state, PLAYER)).toBe('PLAYER');
    expect(campaignRole(state, OUTSIDER)).toBeNull();
    expect(campaignRole(state, { actorId: 'dm-ravenford', kind: 'system' })).toBe('SYSTEM');
    expect(campaignRole(null, DM)).toBeNull();
  });
});

describe('resolvePerspective for the player', () => {
  it.each([
    ['PUBLIC', 'PUBLIC', ['PUBLIC']],
    ['PARTY', 'PARTY', ['PUBLIC', 'PARTY']],
    ['PLAYER', 'CHARACTER:elowen-starwhisper', ['PUBLIC', 'CHARACTER:elowen-starwhisper', 'PARTY']],
    [
      'CHARACTER:elowen-starwhisper',
      'CHARACTER:elowen-starwhisper',
      ['PUBLIC', 'CHARACTER:elowen-starwhisper', 'PARTY'],
    ],
  ])('grants %s', (raw, label, scopes) => {
    const access = resolvePerspective(state, PLAYER, request(raw));
    expect(access.ok && access.perspective.label).toBe(label);
    expect(access.ok && [...(access.perspective.scopes as Set<string>)].sort()).toEqual(
      [...scopes].sort(),
    );
  });

  it.each([
    'DM',
    'NPC:mira-vale',
    'NPC:orin-stonebeard',
    'NPC:nobody',
    `NPC:${ASHEN_CIRCLE_ID}`,
    'CHARACTER:mira-vale',
    'CHARACTER:nobody',
    `CHARACTER:${ASHEN_CIRCLE_ID}`,
  ])('forbids %s identically, whether or not the target exists', (raw) => {
    expect(resolvePerspective(state, PLAYER, request(raw))).toEqual({
      ok: false,
      reason: 'FORBIDDEN',
    });
  });
});

describe('a player who holds several characters (docs/adr/0044-online-play.md §6)', () => {
  const BRANN = 'brann-ironvale';
  const both = (): WorldState => ({
    ...state,
    roster: new Map([...[...state.roster].filter(([id]) => id !== BRANN), [BRANN, PLAYER.actorId]]),
  });

  it('looks as each of them, each with its own knowledge, and as no one else', () => {
    const held = both();
    expect(controlledCharacters(held, PLAYER.actorId)).toEqual(['elowen-starwhisper', BRANN]);
    const brann = resolvePerspective(held, PLAYER, request(`CHARACTER:${BRANN}`));
    expect(brann.ok && brann.perspective.label).toBe(`CHARACTER:${BRANN}`);
    expect(brann.ok && [...(brann.perspective.scopes as Set<string>)].sort()).toEqual(
      ['PARTY', 'PUBLIC', `CHARACTER:${BRANN}`].sort(),
    );
    // The PLAYER perspective is the first character's.
    const first = resolvePerspective(held, PLAYER, request('PLAYER'));
    expect(first.ok && first.perspective.label).toBe('CHARACTER:elowen-starwhisper');
    expect(resolvePerspective(held, PLAYER, request('CHARACTER:maren-ashby'))).toEqual({
      ok: false,
      reason: 'FORBIDDEN',
    });
  });

  it('offers a perspective for each in the session', () => {
    const session = campaignSession(both(), PLAYER);
    expect(session?.characters.map((character) => character.entityId)).toEqual([
      'elowen-starwhisper',
      BRANN,
    ]);
    expect(session?.perspectives.map((option) => option.value)).toEqual([
      'PLAYER',
      'CHARACTER:elowen-starwhisper',
      `CHARACTER:${BRANN}`,
      'PARTY',
      'PUBLIC',
    ]);
  });
});

describe('resolvePerspective for others', () => {
  it.each(['DM', 'PUBLIC', 'PARTY', 'PLAYER', 'NPC:mira-vale', 'CHARACTER:elowen-starwhisper'])(
    'reveals nothing to a non-member, not even the campaign (%s)',
    (raw) => {
      expect(resolvePerspective(state, OUTSIDER, request(raw))).toEqual({
        ok: false,
        reason: 'NOT_FOUND',
      });
      expect(resolvePerspective(null, OUTSIDER, request(raw))).toEqual({
        ok: false,
        reason: 'NOT_FOUND',
      });
      expect(resolvePerspective(null, DM, request(raw))).toEqual({
        ok: false,
        reason: 'NOT_FOUND',
      });
    },
  );

  it('lets the DM use any real perspective', () => {
    const dm = resolvePerspective(state, DM, request('DM'));
    expect(dm.ok && dm.perspective.scopes).toBe('ALL');

    const mira = resolvePerspective(state, DM, request('NPC:mira-vale'));
    expect(mira.ok && [...(mira.perspective.scopes as Set<string>)].sort()).toEqual([
      'NPC:mira-vale',
      'PUBLIC',
    ]);
    expect(mira.ok && mira.perspective.holderId).toBe('mira-vale');

    expect(resolvePerspective(state, DM, request('NPC:elowen-starwhisper'))).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    });
    expect(resolvePerspective(state, DM, request('CHARACTER:mira-vale'))).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    });
    expect(resolvePerspective(state, DM, request('PLAYER'))).toEqual({
      ok: false,
      reason: 'FORBIDDEN',
    });
  });

  it('gives an unassigned character no party knowledge', () => {
    const roster = new Map<string, string>();
    const access = resolvePerspective(
      { ...state, roster },
      DM,
      request('CHARACTER:elowen-starwhisper'),
    );
    expect(access.ok && [...(access.perspective.scopes as Set<string>)].sort()).toEqual([
      'CHARACTER:elowen-starwhisper',
      'PUBLIC',
    ]);
    expect(resolvePerspective({ ...state, roster }, PLAYER, request('PARTY'))).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    });
  });
});

describe('a table display (docs/adr/0042-table-display.md)', () => {
  const DISPLAY = {
    actorId: 'display:4f1c2a9e-7b3d-4e8a-9c21-5d6f7a8b9c0d',
    kind: 'display',
  } as const;

  it('reads the PUBLIC and PARTY views of its campaign and nothing else', () => {
    expect(campaignRole(state, DISPLAY)).toBe('DISPLAY');
    for (const raw of ['PUBLIC', 'PARTY']) {
      const access = resolvePerspective(state, DISPLAY, request(raw));
      expect(access.ok && access.perspective.kind).toBe(raw);
    }
    for (const raw of ['DM', 'PLAYER', 'CHARACTER:elowen-starwhisper', 'NPC:mira-vale']) {
      expect(resolvePerspective(state, DISPLAY, request(raw))).toEqual({
        ok: false,
        reason: 'FORBIDDEN',
      });
    }
  });
});
