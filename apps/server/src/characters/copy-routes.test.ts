import { randomUUID } from 'node:crypto';

import type {
  CharacterCreatedResponse,
  CharacterSheet,
  CopyableCharactersResponse,
} from '@ltw/contracts';
import type { LightMyRequestResponse } from 'fastify';
import { describe, expect, it } from 'vitest';

import {
  OTHER_CAMPAIGN,
  OTHER_SEAT,
  SEREN,
  signInTable,
  type SignInTable,
} from '../testing/sign-in.ts';

/**
 * A character from another campaign over HTTP (docs/FULL_GAME_PLAN.md decision 15; docs/adr/0056-
 * …md §5): Seren's login plays Other at the other table; at Ravenford she is offered Other and
 * brings it as a sheet only — fresh, assigned to her, nothing it knew or carried.
 */
const PASSWORD = 'correct horse battery';

function cookieOf(response: LightMyRequestResponse, name: string): string {
  const header = response.headers['set-cookie'];
  const values = Array.isArray(header) ? header : header === undefined ? [] : [header];
  return (
    values.map((value) => value.split(';')[0] ?? '').find((p) => p.startsWith(`${name}=`)) ?? ''
  );
}

/** Seren seated at Ravenford with a login, and at the other table with the same one. */
async function serenAtTwoTables(table: SignInTable) {
  const dm = await table.signInWith(await table.dmInvitation());
  const { token } = await table.invite(dm, SEREN);
  const joined = await table.redeem(
    token,
    {},
    { newAccount: { login: 'seren', password: PASSWORD, displayName: 'Seren' } },
  );
  const account = cookieOf(joined, 'ltw_account');
  const session = cookieOf(joined, 'ltw_session');
  const otherDm = await table.signInWith(await table.dmInvitation(OTHER_CAMPAIGN));
  const other = await table.invite(otherDm, OTHER_SEAT, OTHER_CAMPAIGN);
  expect((await table.redeem(other.token, { cookie: account })).statusCode).toBe(200);
  return { dm, session };
}

/** Other's sheet at the other table: Elowen's numbers, tired, poisoned and hurt. */
async function otherSheet(table: SignInTable): Promise<CharacterSheet> {
  const elowen = (await table.engine.load('ravenford'))?.state.characterSheets.get(
    'elowen-starwhisper',
  );
  if (!elowen) throw new Error('no sheet');
  const sheet: CharacterSheet = {
    ...elowen,
    hitPoints: { max: elowen.hitPoints.max, current: 3 },
    conditions: ['poisoned'],
    exhaustion: 2,
    experience: 12_000,
  };
  const set = await table.engine.execute({
    campaignId: OTHER_CAMPAIGN,
    commandId: 'copy-test.other-sheet',
    actor: { actorId: 'operator', kind: 'system' },
    command: { type: 'SetCharacterSheet', entityId: OTHER_SEAT, sheet },
  });
  expect(set.status).toBe('accepted');
  return sheet;
}

describe('a character from another campaign', () => {
  it('is offered to its player and brought as a fresh sheet, once per request', async () => {
    const table = await signInTable();
    const { session } = await serenAtTwoTables(table);
    const sheet = await otherSheet(table);
    const offered = await table.send('GET', '/campaigns/ravenford/characters/copyable', {
      cookie: session,
    });
    expect(offered.json<CopyableCharactersResponse>().characters).toEqual([
      {
        campaignId: OTHER_CAMPAIGN,
        campaignName: 'Other Table',
        characterId: OTHER_SEAT,
        name: 'Other',
        level: 15,
        classes: [
          { classId: 'ranger', level: 7 },
          { classId: 'wizard', level: 8 },
        ],
      },
    ]);
    const body = {
      requestId: randomUUID(),
      fromCampaignId: OTHER_CAMPAIGN,
      characterId: OTHER_SEAT,
    };
    const brought = await table.send(
      'POST',
      '/campaigns/ravenford/characters/copy',
      { cookie: session },
      body,
    );
    expect(brought.statusCode).toBe(201);
    const { characterId } = brought.json<CharacterCreatedResponse>();
    const again = await table.send(
      'POST',
      '/campaigns/ravenford/characters/copy',
      { cookie: session },
      body,
    );
    expect(again.json<CharacterCreatedResponse>().characterId).toBe(characterId);
    const state = (await table.engine.load('ravenford'))?.state;
    const copy = state?.characterSheets.get(characterId);
    // Fresh: all its hit points, no condition or Exhaustion; its levels and experience kept.
    expect(copy).toMatchObject({
      hitPoints: { max: sheet.hitPoints.max, current: sheet.hitPoints.max },
      conditions: [],
      experience: 12_000,
      classes: sheet.classes,
    });
    expect(copy?.exhaustion).toBeUndefined();
    expect(state?.entities.get(characterId)?.name).toBe('Other');
    expect([...(state?.roster.keys() ?? [])].filter((id) => id === characterId)).toHaveLength(1);
    // Nothing it carried or knew comes with it.
    expect(
      [...(state?.possessions.values() ?? [])].some((one) => one.holderId === characterId),
    ).toBe(false);
  });

  it('offers nothing a login does not play, and refuses one not offered', async () => {
    const table = await signInTable();
    const { session, dm } = await serenAtTwoTables(table);
    const forged = await table.send(
      'POST',
      '/campaigns/ravenford/characters/copy',
      { cookie: session },
      {
        requestId: randomUUID(),
        fromCampaignId: OTHER_CAMPAIGN,
        characterId: 'elowen-starwhisper',
      },
    );
    expect(forged.statusCode).toBe(404);
    // The DM brings no character of their own this way.
    const dmOffered = await table.send('GET', '/campaigns/ravenford/characters/copyable', {
      cookie: dm,
    });
    expect(dmOffered.statusCode).toBe(404);
  });
});
