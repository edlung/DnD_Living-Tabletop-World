import type { AccountResponse } from '@ltw/contracts';
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
});
