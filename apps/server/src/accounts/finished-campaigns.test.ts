import type { AccountResponse, ChronicleListResponse, EndingResponse } from '@ltw/contracts';
import type { LightMyRequestResponse } from 'fastify';
import { describe, expect, it } from 'vitest';

import { SEREN, signInTable, type SignInTable } from '../testing/sign-in.ts';

/**
 * Finished adventures in an account's list (docs/adr/0072-keepsakes.md §2): what the list says of
 * a campaign its DM has finished, and that a reopened one is played again.
 */
function cookieOf(response: LightMyRequestResponse, name: string): string {
  const header = response.headers['set-cookie'];
  const values = Array.isArray(header) ? header : header === undefined ? [] : [header];
  const pair = values
    .map((value) => value.split(';')[0] ?? '')
    .find((one) => one.startsWith(`${name}=`));
  if (!pair) throw new Error(`no ${name} cookie`);
  return pair;
}

/** The DM signed in, and Seren invited and joining with a new account. */
async function joinedAccount(table: SignInTable) {
  const dm = await table.signInWith(await table.dmInvitation());
  const { token } = await table.invite(dm, SEREN);
  const response = await table.redeem(
    token,
    {},
    { newAccount: { login: 'seren', password: 'correct horse battery', displayName: 'Seren' } },
  );
  expect(response.statusCode).toBe(200);
  return { dm, account: cookieOf(response, 'ltw_account') };
}

const finishedOf = async (table: SignInTable, cookie: string) =>
  (await table.send('GET', '/account', { cookie })).json<AccountResponse>().campaigns[0]?.finished;

const asDm = (table: SignInTable, dm: string, path: string, body: unknown) =>
  table.send('POST', `/campaigns/ravenford/${path}`, { cookie: dm }, body);

describe('finished adventures in an account’s list', () => {
  it('says the days played, the heroes and what each keeps, until the campaign is reopened', async () => {
    const table = await signInTable();
    const { dm, account } = await joinedAccount(table);
    expect(await finishedOf(table, account)).toBeNull();
    // The DM closes the evening and finishes the adventure: the list says so, with the days
    // played, the heroes the party knows and what each keeps.
    const ended = await asDm(table, dm, 'commands', {
      commandId: 'finished-test.end',
      command: { type: 'EndSession', sessionId: 'ravenford-s1' },
    });
    expect(ended.statusCode).toBe(200);
    expect(
      (await asDm(table, dm, 'ending?perspective=DM', { finished: true, line: 'Home at last.' }))
        .statusCode,
    ).toBe(204);
    expect(await finishedOf(table, account)).toEqual({
      finishedAt: expect.any(String) as string,
      played: { from: expect.any(String) as string, to: expect.any(String) as string },
      heroes: expect.arrayContaining([expect.any(String)]) as string[],
      keepsakes: [],
    });
    // Reopened, it is among the campaigns being played again.
    await asDm(table, dm, 'ending?perspective=DM', { finished: false });
    expect(await finishedOf(table, account)).toBeNull();
  });

  it('names no one the party has not met: a keepsake the DM chose for a hidden character is left out', async () => {
    const table = await signInTable();
    const { dm, account } = await joinedAccount(table);
    const STRANGER = 'b27fefda-3a9e-416a-8580-8ab36924f200';
    const NAME = 'Veiled Archivist Q7';
    // A character the party does not know, a chapter of the party's story, the evening closed.
    for (const [commandId, command] of [
      [
        'finished-test.stranger',
        {
          type: 'CreateEntity',
          entityId: STRANGER,
          kind: 'character',
          name: NAME,
          existsSince: null,
        },
      ],
      ['finished-test.close', { type: 'EndSession', sessionId: 'ravenford-s1' }],
    ] as const) {
      expect((await asDm(table, dm, 'commands', { commandId, command })).statusCode).toBe(200);
    }
    const written = await asDm(table, dm, 'chronicle', {
      title: 'The first evening',
      perspective: 'PARTY',
      from: 0,
    });
    expect([200, 201]).toContain(written.statusCode);
    const chapter = (
      await table.send('GET', '/campaigns/ravenford/chronicle?perspective=PARTY', { cookie: dm })
    ).json<ChronicleListResponse>().chapters[0];
    if (!chapter) throw new Error('no chapter');
    expect((await asDm(table, dm, 'ending?perspective=DM', { finished: true })).statusCode).toBe(
      204,
    );
    // The DM keeps the chapter for the stranger, and for Seren, whom the party knows.
    for (const characterId of [STRANGER, SEREN]) {
      const kept = await asDm(table, dm, 'keepsakes?perspective=DM', {
        characterId,
        keep: { kind: 'chapter', refId: chapter.chronicleId, line: 'A night to remember.' },
      });
      expect(kept.statusCode, characterId).toBe(204);
    }
    // The account's list: Seren's keepsake, and nothing of the stranger — no name, no keepsake.
    const listed = await table.send('GET', '/account', { cookie: account });
    const finished = listed.json<AccountResponse>().campaigns[0]?.finished;
    expect(finished?.keepsakes).toEqual([
      {
        hero: 'Seren Ashgrove',
        kind: 'chapter',
        label: 'The first evening',
        line: 'A night to remember.',
      },
    ]);
    expect(finished?.heroes).not.toContain(NAME);
    expect(listed.body).not.toContain(NAME);
    expect(listed.body).not.toContain(STRANGER);
    // Inside the campaign the party reads that keepsake without a name, as it reads a star's.
    const inside = (
      await table.send('GET', '/campaigns/ravenford/ending?perspective=PARTY', { cookie: dm })
    ).json<EndingResponse>();
    expect(inside.keepsakes.find((kept) => kept.hero.entityId === STRANGER)?.hero.name).toBeNull();
    expect(inside.keepsakes).toHaveLength(2);
  });
});
