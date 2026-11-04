import { randomBytes } from 'node:crypto';

import type {
  AccountResponse,
  DmLibraryResponse,
  EnteredCampaignResponse,
  KnownEntitiesResponse,
  PreparedEncounterListResponse,
  QuestListResponse,
} from '@ltw/contracts';
import type { LightMyRequestResponse } from 'fastify';
import { describe, expect, it } from 'vitest';

import {
  OTHER_CAMPAIGN,
  OTHER_SEAT,
  SEREN,
  signInTable,
  tokenOfLink,
  type SignInTable,
} from '../testing/sign-in.ts';

/**
 * Accounts (docs/adr/0041-accounts.md, Stage 600): a login and a password that hold a person's
 * seats; inside a campaign the ADR 0036 session still decides.
 */
const PASSWORD = 'correct horse battery';

/** The `name=value` pair of a cookie the response set, or null. */
function cookieOf(response: LightMyRequestResponse, name: string): string | null {
  const header = response.headers['set-cookie'];
  const values = Array.isArray(header) ? header : header === undefined ? [] : [header];
  const pair = values
    .map((value) => value.split(';')[0] ?? '')
    .find((p) => p.startsWith(`${name}=`));
  return pair ?? null;
}

const newAccount = (login: string) => ({ login, password: PASSWORD, displayName: 'Seren' });

/** The DM signed in, and Seren invited and joining with a new account. */
async function joinedAccount(table: SignInTable) {
  const dm = await table.signInWith(await table.dmInvitation());
  const { token } = await table.invite(dm, SEREN);
  const response = await table.redeem(token, {}, { newAccount: newAccount('seren') });
  expect(response.statusCode).toBe(200);
  const account = cookieOf(response, 'ltw_account');
  const session = cookieOf(response, 'ltw_session');
  if (!account || !session) throw new Error('no cookies');
  return { dm, account, session };
}

const accountOf = async (table: SignInTable, cookie: string) =>
  (await table.send('GET', '/account', { cookie })).json<AccountResponse>();

describe('accounts', () => {
  it('joins with a new account whose hub lists the campaign and the character', async () => {
    const table = await signInTable();
    const { account, session } = await joinedAccount(table);
    expect(await accountOf(table, account)).toEqual({
      login: 'seren',
      displayName: 'Seren',
      campaigns: [
        {
          campaignId: 'ravenford',
          name: expect.any(String) as string,
          role: 'player',
          language: 'en',
          characters: [{ entityId: SEREN, name: expect.any(String) as string }],
        },
      ],
    });
    // The campaign session works as before; the account cookie alone opens no campaign route.
    expect((await table.send('GET', '/auth/session', { cookie: session })).statusCode).toBe(200);
    const onlyAccount = await table.send(
      'GET',
      '/campaigns/ravenford/entities?perspective=PLAYER',
      {
        cookie: account,
      },
    );
    expect(onlyAccount.statusCode).toBe(401);
  });

  it('signs in with the password from any device, and opens the campaign from the hub', async () => {
    const table = await signInTable();
    await joinedAccount(table);
    const wrong = await table.send(
      'POST',
      '/auth/sign-in',
      {},
      { login: 'seren', password: 'nope-nope-nope' },
    );
    const unknown = await table.send(
      'POST',
      '/auth/sign-in',
      {},
      { login: 'nobody', password: PASSWORD },
    );
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json<{ error: unknown }>().error).toEqual(
      unknown.json<{ error: unknown }>().error,
    );
    const signedIn = await table.send(
      'POST',
      '/auth/sign-in',
      {},
      { login: 'SEREN', password: PASSWORD },
    );
    expect(signedIn.statusCode).toBe(200);
    const account = cookieOf(signedIn, 'ltw_account') ?? '';
    const entered = await table.send('POST', '/account/campaigns/ravenford/enter', {
      cookie: account,
    });
    expect(entered.json<EnteredCampaignResponse>()).toEqual({
      campaignId: 'ravenford',
      role: 'player',
    });
    const session = cookieOf(entered, 'ltw_session') ?? '';
    expect((await table.send('GET', '/auth/session', { cookie: session })).statusCode).toBe(200);
    // A campaign without a seat is the same 404 as one that does not exist.
    const other = await table.send('POST', '/account/campaigns/other-table/enter', {
      cookie: account,
    });
    expect(other.statusCode).toBe(404);
  });

  it('rests a login after five failed sign-ins', async () => {
    const table = await signInTable();
    await joinedAccount(table);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const ip = `198.51.100.${String(attempt + 1)}`;
      await table.send(
        'POST',
        '/auth/sign-in',
        { ip },
        { login: 'seren', password: 'wrong-password-1' },
      );
    }
    const right = await table.send(
      'POST',
      '/auth/sign-in',
      { ip: '198.51.100.9' },
      { login: 'seren', password: PASSWORD },
    );
    expect(right.statusCode).toBe(429);
    table.clock.advance(17 * 60_000);
    const later = await table.send(
      'POST',
      '/auth/sign-in',
      { ip: '198.51.100.9' },
      { login: 'seren', password: PASSWORD },
    );
    expect(later.statusCode).toBe(200);
  });

  it('refuses a taken login and a second seat before the invitation is spent', async () => {
    const table = await signInTable();
    const { dm, account } = await joinedAccount(table);
    // Seren's seat is taken: the DM frees it and invites again.
    await table.send('POST', `/campaigns/ravenford/members/${SEREN}/revoke`, { cookie: dm });
    const { token } = await table.invite(dm, SEREN);
    const taken = await table.redeem(token, {}, { newAccount: newAccount('seren') });
    expect(taken.statusCode).toBe(409);
    expect(taken.json<{ reason: string }>().reason).toBe('login-taken');
    // The same invitation still works with a free login.
    const fresh = await table.redeem(token, {}, { newAccount: newAccount('seren-two') });
    expect(fresh.statusCode).toBe(200);
    // The first account's seat went with the revocation: its hub lists nothing.
    expect((await accountOf(table, account)).campaigns).toEqual([]);
  });

  it('refuses a second seat for an account in the same campaign, the invitation unspent', async () => {
    const table = await signInTable();
    const { dm, account } = await joinedAccount(table);
    // Elowen's seat is freed, then offered to the account that already sits as Seren.
    await table.send('POST', '/campaigns/ravenford/members/elowen-starwhisper/revoke', {
      cookie: dm,
    });
    const { token } = await table.invite(dm, 'elowen-starwhisper');
    const second = await table.redeem(token, { cookie: account });
    expect(second.statusCode).toBe(409);
    expect(second.json<{ reason: string }>().reason).toBe('already-seated');
  });

  it('claims a live invitation session for a new account, once', async () => {
    const table = await signInTable();
    const dm = await table.signInWith(await table.dmInvitation());
    const { token } = await table.invite(dm, SEREN);
    const session = await table.signInWith(token);
    const claimed = await table.send(
      'POST',
      '/auth/claim',
      { cookie: session },
      newAccount('seren'),
    );
    expect(claimed.statusCode).toBe(201);
    const account = cookieOf(claimed, 'ltw_account') ?? '';
    expect((await accountOf(table, account)).campaigns.map((c) => c.role)).toEqual(['player']);
    const again = await table.send(
      'POST',
      '/auth/claim',
      { cookie: session },
      newAccount('seren-b'),
    );
    expect(again.json<{ reason: string }>().reason).toBe('has-account');
    // The DM claims the DM's seat too.
    const dmClaim = await table.send('POST', '/auth/claim', { cookie: dm }, newAccount('the-dm'));
    const dmAccount = cookieOf(dmClaim, 'ltw_account') ?? '';
    expect((await accountOf(table, dmAccount)).campaigns.map((c) => c.role)).toEqual(['dm']);
  });

  it('resets a forgotten password through the DM, signing the account out elsewhere', async () => {
    const table = await signInTable();
    const { dm, account, session } = await joinedAccount(table);
    const issued = await table.send('POST', `/campaigns/ravenford/members/${SEREN}/reset`, {
      cookie: dm,
    });
    expect(issued.statusCode).toBe(201);
    const { link } = issued.json<{ link: string }>();
    expect(link.startsWith('https://table.example/reset#')).toBe(true);
    const reset = await table.send(
      'POST',
      '/auth/reset',
      {},
      { token: tokenOfLink(link), password: 'a brand new phrase' },
    );
    expect(reset.statusCode).toBe(204);
    expect((await table.send('GET', '/account', { cookie: account })).statusCode).toBe(401);
    // The seat's campaign session, opened before the reset, signs in again too.
    expect((await table.send('GET', '/auth/session', { cookie: session })).statusCode).toBe(401);
    const again = await table.send(
      'POST',
      '/auth/reset',
      {},
      { token: tokenOfLink(link), password: 'another phrase!' },
    );
    expect(again.statusCode).toBe(401);
    const signedIn = await table.send(
      'POST',
      '/auth/sign-in',
      {},
      { login: 'seren', password: 'a brand new phrase' },
    );
    expect(signedIn.statusCode).toBe(200);
  });

  it('answers a forged token with the one 401, whatever login it names', async () => {
    const table = await signInTable();
    await joinedAccount(table);
    const forged = await table.redeem(
      randomBytes(32).toString('base64url'),
      {},
      { newAccount: newAccount('seren') },
    );
    expect(forged.statusCode).toBe(401);
    expect(forged.json<{ reason?: string }>().reason).toBeUndefined();
  });

  it('lets a DM reset only a login that plays at that DM’s tables alone', async () => {
    const table = await signInTable();
    const dmJoin = await table.redeem(
      await table.dmInvitation(),
      {},
      { newAccount: newAccount('the-dm') },
    );
    const dmAccount = cookieOf(dmJoin, 'ltw_account') ?? '';
    const dm = cookieOf(dmJoin, 'ltw_session') ?? '';
    const { token } = await table.invite(dm, SEREN);
    const seren = cookieOf(
      await table.redeem(token, {}, { newAccount: newAccount('seren') }),
      'ltw_account',
    );
    // Seren also plays at the other table, led there by a DM without this login.
    const otherDm = await table.signInWith(await table.dmInvitation(OTHER_CAMPAIGN));
    const other = await table.invite(otherDm, OTHER_SEAT, OTHER_CAMPAIGN);
    expect((await table.redeem(other.token, { cookie: seren ?? '' })).statusCode).toBe(200);
    const reset = `/campaigns/ravenford/members/${SEREN}/reset`;
    const refused = await table.send('POST', reset, { cookie: dm });
    expect(refused.statusCode).toBe(409);
    expect(refused.json<{ reason: string }>().reason).toBe('other-tables');
    // Once the DM's login leads the other table too, the reset is the DM's to give.
    const led = await table.redeem(await table.dmInvitation(OTHER_CAMPAIGN), { cookie: dmAccount });
    expect(led.statusCode).toBe(200);
    expect((await table.send('POST', reset, { cookie: dm })).statusCode).toBe(201);
  });

  it('changes the password with the current one, keeping only this device signed in', async () => {
    const table = await signInTable();
    const { account, session } = await joinedAccount(table);
    const other =
      cookieOf(
        await table.send('POST', '/auth/sign-in', {}, { login: 'seren', password: PASSWORD }),
        'ltw_account',
      ) ?? '';
    const refused = await table.send(
      'POST',
      '/account/password',
      { cookie: account },
      { current: 'not it at all', next: 'the next phrase' },
    );
    expect(refused.statusCode).toBe(403);
    const changed = await table.send(
      'POST',
      '/account/password',
      { cookie: account },
      { current: PASSWORD, next: 'the next phrase' },
    );
    expect(changed.statusCode).toBe(204);
    expect((await table.send('GET', '/account', { cookie: account })).statusCode).toBe(200);
    expect((await table.send('GET', '/account', { cookie: other })).statusCode).toBe(401);
    expect((await table.send('GET', '/auth/session', { cookie: session })).statusCode).toBe(401);
  });

  it('creates a campaign from Ravenford with the account as its DM and every seat free', async () => {
    const table = await signInTable();
    const { account } = await joinedAccount(table);
    const created = await table.send(
      'POST',
      '/account/campaigns',
      { cookie: account },
      { template: 'ravenford-ru' },
    );
    expect(created.statusCode).toBe(201);
    const { campaignId, role } = created.json<EnteredCampaignResponse>();
    expect(role).toBe('dm');
    const state = (await table.engine.load(campaignId))?.state;
    expect(state?.campaign?.language).toBe('ru');
    expect(state?.roster.size).toBe(0);
    const session = cookieOf(created, 'ltw_session') ?? '';
    expect((await table.send('GET', '/auth/session', { cookie: session })).statusCode).toBe(200);
    // A Russian campaign reads the Russian quest book, whatever the server's own (Stage 605).
    const quests = await table.send('GET', `/campaigns/${campaignId}/quests?perspective=DM`, {
      cookie: session,
    });
    expect(quests.json<QuestListResponse>().quests.map((quest) => quest.title)).toEqual([
      'Пропавший караван',
    ]);
    const listed = (await accountOf(table, account)).campaigns.map((c) => [c.campaignId, c.role]);
    expect(listed).toEqual([
      ['ravenford', 'player'],
      [campaignId, 'dm'],
    ]);
    // The DM of the new campaign invites as any DM does.
    const { token } = await table.invite(session, 'elowen-starwhisper', campaignId);
    expect((await table.redeem(token)).statusCode).toBe(200);
  });

  it('creates a campaign from The Bells of Hollowmere that reads its own books and library', async () => {
    // docs/adr/0058-campaign-content.md §5: a second ready adventure, for levels 1 to 5.
    const table = await signInTable();
    const { account } = await joinedAccount(table);
    const created = await table.send(
      'POST',
      '/account/campaigns',
      { cookie: account },
      { template: 'hollowmere-en' },
    );
    expect(created.statusCode).toBe(201);
    const { campaignId } = created.json<EnteredCampaignResponse>();
    const state = (await table.engine.load(campaignId))?.state;
    expect(state?.campaign).toMatchObject({ language: 'en', adventure: 'hollowmere' });
    // Four ready-made characters, every seat free for the DM's invitations.
    const characters = [...(state?.entities.values() ?? [])].filter(
      (one) => one.kind === 'character',
    );
    expect(characters.map((one) => one.name).sort()).toEqual([
      'Bryn Ashdown',
      'Hesk Coalbeard',
      'Lyra Venn',
      'Wren Underbough',
    ]);
    expect(state?.roster.size).toBe(0);
    // Its GPT pictures, approved by its DM: Hollowmere's own, and Ravenford's North Gate it opens at.
    expect(state?.assets.canonical.has('hollowmere')).toBe(true);
    expect(state?.assets.canonical.has('north-gate')).toBe(true);
    const cookie = cookieOf(created, 'ltw_session') ?? '';
    const read = (path: string) =>
      table.send('GET', `/campaigns/${campaignId}/${path}`, { cookie });
    // Its DM opens where its scene is played: Ravenford's North Gate, not Ravenford's square.
    const directory = (await read('entities?perspective=DM')).json<KnownEntitiesResponse>();
    expect(directory.scenePlaceId).toBe('north-gate');
    // Its quests and prepared encounters, not Ravenford's.
    const quests = (await read('quests?perspective=DM')).json<QuestListResponse>().quests;
    expect(quests.map((quest) => quest.title)).toContain('The Widow’s Wagon');
    expect(quests.map((quest) => quest.title)).not.toContain('The Missing Caravan');
    const prepared = (await read('encounters/prepared')).json<PreparedEncounterListResponse>();
    expect(prepared.encounters.map((one) => one.title)).toContain('Ambush at the Willow Ford');
    // Its DM's library: the handouts and the tables it was written with.
    const library = (await read('dm/library')).json<DmLibraryResponse>();
    expect(library.handouts.map((one) => one.title)).toContain('A letter of hire');
    expect(library.tables.map((one) => one.name)).toEqual([
      'The Mill Road',
      'Fog on the marsh',
      'Talk in Hollowmere',
    ]);
  });

  it('stops at ten campaigns of its own', async () => {
    const table = await signInTable();
    const { account } = await joinedAccount(table);
    const accountId = (await table.accounts.findByLogin('seren'))?.accountId ?? '';
    for (let index = 0; index < 10; index += 1) {
      await table.accounts.addSeat({
        accountId,
        campaignId: `full-${String(index)}`,
        actorId: 'dm-ravenford',
        role: 'dm',
        invitationId: crypto.randomUUID(),
        joinedAt: new Date(0).toISOString(),
      });
    }
    const refused = await table.send(
      'POST',
      '/account/campaigns',
      { cookie: account },
      { template: 'ravenford-en' },
    );
    expect(refused.json<{ reason: string }>().reason).toBe('campaign-limit');
  });
});
