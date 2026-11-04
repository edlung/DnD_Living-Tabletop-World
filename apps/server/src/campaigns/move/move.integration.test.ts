import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from '../../accounts/passwords.ts';
import { PostgresAccountStore } from '../../accounts/postgres-account-store.ts';
import { PostgresCredentialStore } from '../../auth/postgres-credential-store.ts';
import { PostgresChatStore } from '../../chat/postgres-chat-store.ts';
import { PostgresDmNoteStore } from '../../dm/postgres-note-store.ts';
import { PostgresTrackStore } from '../../music/postgres-track-store.ts';
import {
  createThrowawayDatabase,
  type ThrowawayDatabase,
} from '../../testing/throwaway-database.ts';
import { loadRavenfordSeed } from '../../world-engine/ravenford-seed.ts';
import { createWorldEngine } from '../../world-engine/runtime.ts';
import { stateDigest } from '../../world-engine/state-digest.ts';
import { ImportRefusal } from './import.ts';
import { DivergedError } from './merge.ts';
import { endMove, markAway, openMove } from './moves.ts';
import { PackageError } from './package.ts';
import { bring, pack, rewrite, row } from '../../testing/campaign-move.ts';

/**
 * A campaign's move between two servers (docs/adr/0061-local-mode.md §5–6, Stage 697a), on two
 * PostgreSQL databases: the VPS and the laptop. A move takes the history, the table's records and
 * the accounts; the campaign is away where it left (its history takes no appends) and comes back
 * with what was played meanwhile. A package never overwrites a campaign at home, a diverged history
 * is refused, a tampered or foreign package is refused, and a refusal writes nothing.
 */
let vps: ThrowawayDatabase;
let laptop: ThrowawayDatabase;
let vpsPool: pg.Pool;
let laptopPool: pg.Pool;
/** Ravenford's seed: the first 60 commands seed the campaign, the next ones are play. */
let submissions: Awaited<ReturnType<typeof loadRavenfordSeed>>['submissions'];

const CAMPAIGN = 'ravenford';
const NOW = '2026-11-01T10:00:00.000Z';
const LATER = '2026-11-01T12:00:00.000Z';
const PHRASE = 'a long enough phrase';
const NOTES = { miller: randomUUID(), bell: randomUUID() };

beforeEach(async () => {
  [vps, laptop] = await Promise.all([
    createThrowawayDatabase({ migrate: true }),
    createThrowawayDatabase({ migrate: true }),
  ]);
  vpsPool = new pg.Pool({ connectionString: vps.url, max: 4 });
  laptopPool = new pg.Pool({ connectionString: laptop.url, max: 4 });
  submissions = (await loadRavenfordSeed()).submissions;
  const engine = createWorldEngine(vpsPool);
  for (const submission of submissions.slice(0, 60)) {
    expect((await engine.execute(submission)).status).toBe('accepted');
  }
  await seat(vpsPool, 'master', 'Мастер', 'dm', 'dm-ravenford');
  await seat(vpsPool, 'masha', 'Маша', 'player', 'player-masha');
  const chat = new PostgresChatStore(vpsPool);
  await chat.add(line('The bell rings twice.'));
  const notes = new PostgresDmNoteStore(vpsPool);
  await notes.create(note(NOTES.miller, 'The miller lies'));
  await notes.create(note(NOTES.bell, 'The bell'));
  const tracks = new PostgresTrackStore(vpsPool);
  await tracks.add({
    campaignId: CAMPAIGN,
    trackId: randomUUID(),
    requestId: randomUUID(),
    title: 'Rain on the roof',
    mediaType: 'audio/ogg',
    addedAt: NOW,
    content: Uint8Array.from({ length: 3000 }, (_, index) => index % 251),
  });
});

afterEach(async () => {
  await Promise.all([vpsPool.end(), laptopPool.end()]);
  await Promise.all([vps.drop(), laptop.drop()]);
});

async function seat(
  pool: pg.Pool,
  login: string,
  displayName: string,
  role: 'dm' | 'player',
  actorId: string,
  accountId: string = randomUUID(),
): Promise<string> {
  const accounts = new PostgresAccountStore(pool);
  await accounts.createAccount({
    accountId,
    login,
    passwordHash: await hashPassword(PHRASE),
    displayName,
    createdAt: NOW,
    passwordChangedAt: NOW,
  });
  const invitationId = randomUUID();
  await new PostgresCredentialStore(pool).createInvitation({
    invitationId,
    tokenHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
    campaignId: CAMPAIGN,
    purpose: role === 'dm' ? 'dm' : 'player',
    characterId: role === 'dm' ? null : 'pc-elowen',
    createdBy: 'operator',
    createdAt: NOW,
    expiresAt: LATER,
    actorId,
  });
  await accounts.addSeat({
    accountId,
    campaignId: CAMPAIGN,
    actorId,
    role,
    invitationId,
    joinedAt: NOW,
  });
  return accountId;
}

const line = (text: string) => ({
  campaignId: CAMPAIGN,
  messageId: randomUUID(),
  channel: 'table' as const,
  voice: 'out-of-character' as const,
  speakerId: null,
  recipientId: null,
  text,
  at: NOW,
});

const note = (noteId: string, title: string) => ({
  campaignId: CAMPAIGN,
  noteId,
  title,
  body: 'Ask the twins.',
  createdAt: NOW,
  updatedAt: NOW,
});

async function digest(pool: pg.Pool): Promise<string> {
  const loaded = await createWorldEngine(pool).load(CAMPAIGN);
  if (!loaded) throw new Error('no campaign');
  return stateDigest(loaded.state);
}

const tally = async (pool: pg.Pool, table: string) =>
  Number(
    (
      await pool.query<{ count: string }>(`SELECT count(*) FROM ${table} WHERE campaign_id = $1`, [
        CAMPAIGN,
      ])
    ).rows[0]?.count,
  );

describe('a campaign’s move', () => {
  it('goes to the laptop with its history and accounts, is played there and comes back', async () => {
    const away = await pack(vpsPool, { move: { destination: 'MacBook' } });
    expect(await openMove(vpsPool, CAMPAIGN)).toEqual({
      destination: 'MacBook',
      movedAt: expect.any(String) as unknown,
    });
    // Away: the VPS's history takes no appends, under the application.
    await expect(createWorldEngine(vpsPool).execute(submissions[60])).rejects.toThrow(/is away/);

    const arrived = await bring(laptopPool, away);
    expect(arrived).toMatchObject({
      campaignId: CAMPAIGN,
      outcome: 'created',
      accounts: { created: 2 },
    });
    expect(await digest(laptopPool)).toBe(await digest(vpsPool));
    const masha = await new PostgresAccountStore(laptopPool).findByLogin('masha');
    expect(masha !== null && (await verifyPassword(PHRASE, masha.passwordHash))).toBe(true);
    expect(await tally(laptopPool, 'ltw_music_tracks')).toBe(1);

    // Played at home: a command, a chat line, a note gone, the track deleted.
    expect((await createWorldEngine(laptopPool).execute(submissions[60])).status).toBe('accepted');
    await new PostgresChatStore(laptopPool).add(line('Who rang it?'));
    await new PostgresDmNoteStore(laptopPool).delete(CAMPAIGN, NOTES.bell, LATER);
    await laptopPool.query('DELETE FROM ltw_music_tracks WHERE campaign_id = $1', [CAMPAIGN]);
    const played = await digest(laptopPool);

    const back = await pack(laptopPool, { move: { destination: 'ltw.example' } });
    const returned = await bring(vpsPool, back);
    expect(returned).toMatchObject({ outcome: 'returned', accounts: { created: 0 } });
    expect(returned.events).toBeGreaterThan(0);
    expect(await openMove(vpsPool, CAMPAIGN)).toBeNull();
    expect(await openMove(laptopPool, CAMPAIGN)).toMatchObject({ destination: 'ltw.example' });
    expect(await digest(vpsPool)).toBe(played);
    expect(await tally(vpsPool, 'ltw_chat_messages')).toBe(2);
    expect((await new PostgresDmNoteStore(vpsPool).list(CAMPAIGN)).map((one) => one.title)).toEqual(
      ['The miller lies'],
    );
    expect(await tally(vpsPool, 'ltw_music_tracks')).toBe(0);
    // Home again: play goes on.
    expect((await createWorldEngine(vpsPool).execute(submissions[61])).status).toBe('accepted');
  });

  it('never overwrites a campaign at home, and refuses a history played apart', async () => {
    const copy = await pack(vpsPool, { move: null });
    expect(await bring(vpsPool, copy)).toMatchObject({ outcome: 'unchanged' });
    expect((await createWorldEngine(vpsPool).execute(submissions[60])).status).toBe('accepted');
    await expect(bring(vpsPool, copy)).rejects.toThrow(ImportRefusal);

    // Moved, the move cancelled on the VPS and both copies played: the way back is refused.
    const away = await pack(vpsPool, { move: { destination: 'MacBook' } });
    await bring(laptopPool, away);
    expect(await endMove(vpsPool, CAMPAIGN, 'cancelled', new Date())).toBe(true);
    expect((await createWorldEngine(vpsPool).execute(submissions[61])).status).toBe('accepted');
    expect((await createWorldEngine(laptopPool).execute(submissions[61])).status).toBe('accepted');
    const back = await pack(laptopPool, { move: { destination: 'ltw.example' } });
    await expect(bring(vpsPool, back)).rejects.toThrow(ImportRefusal);
    expect(await markAway(vpsPool, CAMPAIGN, 'MacBook', new Date())).toBe(true);
    const before = await digest(vpsPool);
    await expect(bring(vpsPool, back)).rejects.toThrow(DivergedError);
    // Nothing was written: still away, the same world.
    expect(await openMove(vpsPool, CAMPAIGN)).not.toBeNull();
    expect(await digest(vpsPool)).toBe(before);
  });

  it('refuses a tampered package, another campaign’s rows and a column it does not know', async () => {
    const copy = await pack(vpsPool, { move: null });
    const text = copy.toString('utf8');
    const tampered = Buffer.from(text.replace('The bell rings twice.', 'The bell rings thrice.'));
    await expect(bring(laptopPool, tampered)).rejects.toThrow(/digest does not match/);
    const foreign = await rewrite(copy, (one) =>
      one.startsWith('R ') && one.includes('The bell rings twice.')
        ? row({
            ...(JSON.parse(one.slice(2)) as Record<string, unknown>),
            campaign_id: 'elsewhere',
          })
        : one,
    );
    await expect(bring(laptopPool, foreign)).rejects.toThrow(/another campaign/);
    const newer = await rewrite(copy, (one) =>
      one.startsWith('T {"name":"ltw_dm_notes"')
        ? one.replace('"columns":[', '"columns":["mood",')
        : one,
    );
    await expect(bring(laptopPool, newer)).rejects.toThrow(PackageError);
    expect(await createWorldEngine(laptopPool).load(CAMPAIGN)).toBeNull();
    expect(await tally(laptopPool, 'ltw_dm_notes')).toBe(0);
  });

  it('refuses a package whose keys another campaign holds here', async () => {
    // The laptop holds Ravenford; another campaign's package reusing its command IDs is refused.
    await bring(laptopPool, await pack(vpsPool, { move: null }));
    const elsewhere = await rewrite(await pack(vpsPool, { move: null }), (one) => {
      if (one.startsWith('H ')) {
        return one.replace('"campaign":"ravenford"', '"campaign":"elsewhere"');
      }
      if (!one.startsWith('R ')) return one;
      const values = JSON.parse(one.slice(2)) as Record<string, unknown>;
      for (const column of ['campaign_id', 'stream_id']) {
        if (values[column] === CAMPAIGN) values[column] = 'elsewhere';
      }
      return row(values);
    });
    await expect(bring(laptopPool, elsewhere)).rejects.toThrow(/keys of another campaign/);
    expect(await createWorldEngine(laptopPool).load('elsewhere')).toBeNull();
  });

  it('never sets the password of an account that did not sit in the campaign here', async () => {
    const stranger = randomUUID();
    await new PostgresAccountStore(laptopPool).createAccount({
      accountId: stranger,
      login: 'stranger',
      passwordHash: await hashPassword('the stranger’s own phrase'),
      displayName: 'Stranger',
      createdAt: NOW,
      passwordChangedAt: NOW,
    });
    // Masha's rows in the package are made to name the stranger, with a later password change.
    const masha = await new PostgresAccountStore(vpsPool).findByLogin('masha');
    if (!masha) throw new Error('no masha');
    const claimed = await rewrite(await pack(vpsPool, { move: null }), (one) =>
      one.startsWith('R ') && one.includes(masha.accountId)
        ? one
            .replaceAll(masha.accountId, stranger)
            .replace(
              /"password_changed_at":"[^"]+"/,
              '"password_changed_at":"2026-12-01T00:00:00+00:00"',
            )
        : one,
    );
    const report = await bring(laptopPool, claimed);
    expect(report.accounts.passwordsChanged).toBe(0);
    const kept = await new PostgresAccountStore(laptopPool).findByLogin('stranger');
    expect(
      kept !== null && (await verifyPassword('the stranger’s own phrase', kept.passwordHash)),
    ).toBe(true);
  });

  it('takes no change to an away campaign’s invitations, under the application', async () => {
    await pack(vpsPool, { move: { destination: 'MacBook' } });
    await expect(
      vpsPool.query('UPDATE ltw_auth_invitations SET used_at = $2 WHERE campaign_id = $1', [
        CAMPAIGN,
        LATER,
      ]),
    ).rejects.toThrow(/is away/);
    expect(await endMove(vpsPool, CAMPAIGN, 'cancelled', new Date())).toBe(true);
    const { rowCount } = await vpsPool.query(
      'UPDATE ltw_auth_invitations SET used_at = $2 WHERE campaign_id = $1 AND used_at IS NULL',
      [CAMPAIGN, LATER],
    );
    expect(rowCount).toBeGreaterThan(0);
  });

  it('merges accounts: a taken login gets a number, a later password comes back', async () => {
    const other = await new PostgresAccountStore(laptopPool).createAccount({
      accountId: randomUUID(),
      login: 'masha',
      passwordHash: await hashPassword('another phrase entirely'),
      displayName: 'Другая Маша',
      createdAt: NOW,
      passwordChangedAt: NOW,
    });
    expect(other).toBe(true);
    const arrived = await bring(
      laptopPool,
      await pack(vpsPool, { move: { destination: 'MacBook' } }),
    );
    expect(arrived.accounts).toEqual({
      created: 2,
      passwordsChanged: 0,
      renamed: [{ from: 'masha', to: 'masha-2' }],
    });
    const renamed = await new PostgresAccountStore(laptopPool).findByLogin('masha-2');
    expect(renamed?.displayName).toBe('Маша');
    // A password changed at home, while the campaign was away: it comes back with it.
    await laptopPool.query(
      'UPDATE ltw_accounts SET password_hash = $2, password_changed_at = $3 WHERE account_id = $1',
      [renamed?.accountId, await hashPassword('changed at home'), new Date().toISOString()],
    );
    // One "changed" in the future does not: the DM's account keeps its own.
    const ada = await new PostgresAccountStore(laptopPool).findByLogin('master');
    await laptopPool.query(
      'UPDATE ltw_accounts SET password_hash = $2, password_changed_at = $3 WHERE account_id = $1',
      [ada?.accountId, await hashPassword('from the future'), '2099-01-01T00:00:00Z'],
    );
    const returned = await bring(vpsPool, await pack(laptopPool, { move: { destination: 'VPS' } }));
    expect(returned.accounts).toEqual({ created: 0, passwordsChanged: 1, renamed: [] });
    const master = await new PostgresAccountStore(vpsPool).findByLogin('master');
    expect(master !== null && (await verifyPassword(PHRASE, master.passwordHash))).toBe(true);
    // The VPS keeps the login it knows; the password is the one changed at home.
    const home = await new PostgresAccountStore(vpsPool).findByLogin('masha');
    expect(home?.accountId).toBe(renamed?.accountId);
    expect(home !== null && (await verifyPassword('changed at home', home.passwordHash))).toBe(
      true,
    );
  });
});
