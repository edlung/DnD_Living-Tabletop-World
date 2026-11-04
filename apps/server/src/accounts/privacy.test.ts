import type { AccountDataResponse, AccountResponse } from '@ltw/contracts';
import type { LightMyRequestResponse } from 'fastify';
import { describe, expect, it } from 'vitest';

import { SEREN, signInTable, type SignInTable } from '../testing/sign-in.ts';

/**
 * A person's data (docs/adr/0062-account-privacy.md §2–3, Stage 699a): the account's copy holds
 * the account, its sign-ins and what it wrote, never a hash or someone else's message; deleting
 * asks for the password and the login, refuses a DM, and leaves nothing of the person: the login
 * is free again, every sign-in ends, the seat is gone and the story stays.
 */
const PASSWORD = 'correct horse battery';

function cookieOf(response: LightMyRequestResponse, name: string): string | null {
  const header = response.headers['set-cookie'];
  const values = Array.isArray(header) ? header : header === undefined ? [] : [header];
  return (
    values.map((value) => value.split(';')[0] ?? '').find((p) => p.startsWith(`${name}=`)) ?? null
  );
}

/** The DM with an account, and Seren joining with one; Seren and the DM have each said a line. */
async function table(): Promise<{
  table: SignInTable;
  dm: { account: string; session: string };
  seren: { account: string; session: string };
}> {
  const table = await signInTable();
  const dmJoined = await table.redeem(
    await table.dmInvitation(),
    {},
    {
      newAccount: { login: 'ada-dm', password: PASSWORD, displayName: 'Ada' },
    },
  );
  const dm = {
    account: cookieOf(dmJoined, 'ltw_account'),
    session: cookieOf(dmJoined, 'ltw_session'),
  };
  if (!dm.account || !dm.session) throw new Error('no DM cookies');
  const { token } = await table.invite(dm.session, SEREN);
  const joined = await table.redeem(
    token,
    {},
    {
      newAccount: { login: 'seren', password: PASSWORD, displayName: 'Seren' },
    },
  );
  const seren = {
    account: cookieOf(joined, 'ltw_account'),
    session: cookieOf(joined, 'ltw_session'),
  };
  if (!seren.account || !seren.session) throw new Error('no player cookies');
  const say = (cookie: string, perspective: string, text: string) =>
    table.send(
      'POST',
      `/campaigns/ravenford/chat?perspective=${perspective}`,
      { cookie },
      {
        channel: 'table',
        voice: 'out-of-character',
        text,
      },
    );
  expect((await say(seren.session, 'PLAYER', 'Seren looks for tracks.')).statusCode).toBe(201);
  expect((await say(dm.session, 'DM', 'The rain washed them away.')).statusCode).toBe(201);
  return {
    table,
    dm: { account: dm.account, session: dm.session },
    seren: { account: seren.account, session: seren.session },
  };
}

describe('a person’s data', () => {
  it('copies the account, its sign-ins and what it wrote, nothing secret and nobody else’s', async () => {
    const { table: t, seren } = await table();
    const response = await t.send('GET', '/account/data', { cookie: seren.account });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="ltw-seren-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    const data = response.json<AccountDataResponse>();
    expect(data.account).toMatchObject({ login: 'seren', displayName: 'Seren' });
    expect(data.sessions.length).toBeGreaterThan(0);
    const campaign = data.campaigns[0];
    expect(campaign?.characters.map((character) => character.entityId)).toEqual([SEREN]);
    expect(campaign?.chat.map((line) => line.text)).toEqual(['Seren looks for tracks.']);
    expect(response.body).not.toMatch(/scrypt|token|password_hash|passwordHash/);
    expect((await t.send('GET', '/account/data')).statusCode).toBe(401);
  });

  it('deletes a player’s account with its password and login, and leaves nothing of them', async () => {
    const { table: t, dm, seren } = await table();
    const remove = (body: unknown) =>
      t.send('POST', '/account/delete', { cookie: seren.account }, body);
    expect((await remove({ login: 'seren', password: 'not the password' })).statusCode).toBe(403);
    expect((await remove({ login: 'someone', password: PASSWORD })).statusCode).toBe(403);
    expect((await remove({ login: 'seren' })).statusCode).toBe(400);
    const deleted = await remove({ login: 'Seren', password: PASSWORD });
    expect(deleted.statusCode).toBe(204);
    expect(String(deleted.headers['set-cookie'])).toMatch(/ltw_account=;.*Max-Age=0/);
    // Every sign-in ended: the account's and the campaign's.
    expect((await t.send('GET', '/account', { cookie: seren.account })).statusCode).toBe(401);
    expect(
      (
        await t.send('GET', '/campaigns/ravenford/lobby?perspective=PLAYER', {
          cookie: seren.session,
        })
      ).statusCode,
    ).toBe(401);
    // The login is free and the old password opens nothing.
    expect(
      (await t.send('POST', '/auth/sign-in', {}, { login: 'seren', password: PASSWORD }))
        .statusCode,
    ).toBe(401);
    expect(await t.accounts.findByLogin('seren')).toBeNull();
    // The story stays: the DM still reads the line Seren said.
    const chat = await t.send('GET', '/campaigns/ravenford/chat?perspective=DM', {
      cookie: dm.session,
    });
    expect(chat.body).toContain('Seren looks for tracks.');
  });

  it('leaves a DM’s account to the operator', async () => {
    const { table: t, dm } = await table();
    const refused = await t.send(
      'POST',
      '/account/delete',
      { cookie: dm.account },
      { login: 'ada-dm', password: PASSWORD },
    );
    expect(refused.statusCode).toBe(409);
    expect(refused.json<{ reason: string }>().reason).toBe('dm-seat');
    expect(
      (await t.send('GET', '/account', { cookie: dm.account })).json<AccountResponse>().login,
    ).toBe('ada-dm');
  });
});
