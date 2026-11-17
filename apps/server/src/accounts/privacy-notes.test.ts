import type { AccountDataResponse } from '@ltw/contracts';
import type { LightMyRequestResponse } from 'fastify';
import { describe, expect, it } from 'vitest';

import { InMemoryNoteStore } from '../notes/note-store.ts';
import { SEREN, signInTable } from '../testing/sign-in.ts';
import { forgetAccount } from './privacy.ts';

/**
 * A hero's backstory and private notes in a person's data (docs/adr/0073-table-ideas.md §5.7,
 * docs/adr/0062-account-privacy.md §2–3): the copy lists the account's own heroes' backstories
 * and the notes its own seat wrote, never another's; deleting the account deletes its notes and
 * leaves the hero's backstory.
 */
const PASSWORD = 'correct horse battery';
const BASE = '/campaigns/ravenford';
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function cookieOf(response: LightMyRequestResponse, name: string): string {
  const header = response.headers['set-cookie'];
  const values = Array.isArray(header) ? header : header === undefined ? [] : [header];
  const found = values.map((v) => v.split(';')[0] ?? '').find((p) => p.startsWith(`${name}=`));
  if (!found) throw new Error(`no ${name} cookie`);
  return found;
}

async function table() {
  const t = await signInTable();
  const dmJoined = await t.redeem(
    await t.dmInvitation(),
    {},
    { newAccount: { login: 'ada-dm', password: PASSWORD, displayName: 'Ada' } },
  );
  const dm = {
    account: cookieOf(dmJoined, 'ltw_account'),
    session: cookieOf(dmJoined, 'ltw_session'),
  };
  const { token } = await t.invite(dm.session, SEREN);
  const joined = await t.redeem(
    token,
    {},
    { newAccount: { login: 'seren', password: PASSWORD, displayName: 'Seren' } },
  );
  const seren = {
    account: cookieOf(joined, 'ltw_account'),
    session: cookieOf(joined, 'ltw_session'),
  };
  const post = (cookie: string, path: string, body: unknown) =>
    t.send('POST', `${BASE}/${path}`, { cookie }, body);
  // Seren's backstory and her note; the DM's own note in her hero's view; another hero's story.
  expect(
    (
      await post(seren.session, `entities/${SEREN}/backstory?perspective=PLAYER`, {
        body: 'Seren grew up on the river barges.',
      })
    ).statusCode,
  ).toBe(204);
  expect(
    (
      await post(seren.session, 'notes?perspective=PLAYER', {
        noteId: ID(1),
        title: 'The ferryman',
        body: 'He knows more than he says.',
      })
    ).statusCode,
  ).toBe(204);
  expect(
    (
      await post(dm.session, `notes?perspective=CHARACTER:${SEREN}`, {
        noteId: ID(2),
        title: 'The DM’s own',
        body: 'Seren’s player likes riddles.',
      })
    ).statusCode,
  ).toBe(204);
  expect(
    (
      await post(dm.session, 'entities/brann-ironvale/backstory?perspective=DM', {
        body: 'Brann once guarded the old mint.',
      })
    ).statusCode,
  ).toBe(204);
  return { t, dm, seren };
}

describe('backstories and private notes in a person’s data', () => {
  it('copies a player’s own hero’s backstory and their own notes, and nobody else’s', async () => {
    const { t, dm, seren } = await table();
    const response = await t.send('GET', '/account/data', { cookie: seren.account });
    const campaign = response.json<AccountDataResponse>().campaigns[0];
    expect(campaign?.backstories).toEqual([
      {
        at: expect.any(String) as string,
        hero: expect.any(String) as string,
        body: 'Seren grew up on the river barges.',
      },
    ]);
    expect(campaign?.notes).toEqual([
      {
        at: expect.any(String) as string,
        hero: expect.any(String) as string,
        title: 'The ferryman',
        body: 'He knows more than he says.',
      },
    ]);
    expect(response.body).not.toContain('likes riddles');
    expect(response.body).not.toContain('old mint');
    // The DM's copy: the DM's own note; no hero's backstory (they are the players'), and never
    // the player's note.
    const theirs = await t.send('GET', '/account/data', { cookie: dm.account });
    const dmCampaign = theirs.json<AccountDataResponse>().campaigns[0];
    expect(dmCampaign?.backstories).toEqual([]);
    expect(dmCampaign?.notes.map((note) => note.title)).toEqual(['The DM’s own']);
    expect(theirs.body).not.toContain('ferryman');
    await t.app.close();
  });

  it('deletes a deleted account’s private notes; the hero keeps its backstory', async () => {
    const { t, dm, seren } = await table();
    const deleted = await t.send(
      'POST',
      '/account/delete',
      { cookie: seren.account },
      { login: 'seren', password: PASSWORD },
    );
    expect(deleted.statusCode).toBe(204);
    // The backstory is the hero's: the DM still reads it.
    const story = await t.send('GET', `${BASE}/entities/${SEREN}/backstory?perspective=DM`, {
      cookie: dm.session,
    });
    expect(story.body).toContain('river barges');
    // The DM's own note stands.
    const mine = await t.send('GET', `${BASE}/notes?perspective=CHARACTER:${SEREN}`, {
      cookie: dm.session,
    });
    expect(mine.body).toContain('likes riddles');
    expect(mine.body).not.toContain('ferryman');
    await t.app.close();
  });

  it('forgets every note of the account’s seats, and no other person’s', async () => {
    const { t } = await table();
    const account = await t.accounts.findByLogin('seren');
    if (!account) throw new Error('no account');
    const [seat] = await t.accounts.seats(account.accountId);
    if (!seat) throw new Error('no seat');
    const notes = new InMemoryNoteStore();
    const note = { noteId: ID(1), title: 'x', body: '', updatedAt: '2026-11-16T18:00:00.000Z' };
    const hers = { campaignId: seat.campaignId, ownerId: seat.actorId, characterId: SEREN };
    const other = { ...hers, ownerId: 'player:someone-else' };
    await notes.writeNote({ ...hers, ...note });
    await notes.writeNote({ ...other, ...note });
    expect(
      await forgetAccount(
        { accounts: t.accounts, credentials: t.credentials, notes },
        account.accountId,
        '2026-11-16T19:00:00.000Z',
      ),
    ).toBe(true);
    expect(await notes.notes(hers)).toEqual([]);
    expect(await notes.notes(other)).toHaveLength(1);
    await t.app.close();
  });
});
