import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PostgresCredentialStore } from '../auth/postgres-credential-store.ts';
import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import type { AccountRecord } from './account-store.ts';
import { hashPassword } from './passwords.ts';
import { PostgresAccountStore } from './postgres-account-store.ts';

/**
 * Accounts on PostgreSQL (migration 0027, Stage 600): a login once, a seat once per campaign and
 * per actor, sessions and resets one way, and a campaign session only from a used invitation.
 */
let database: ThrowawayDatabase;
let pool: pg.Pool;

beforeEach(async () => {
  database = await createThrowawayDatabase({ migrate: true });
  pool = new pg.Pool({ connectionString: database.url });
});

afterEach(async () => {
  await pool.end();
  await database.drop();
});

const NOW = '2026-11-02T10:00:00.000Z';
const LATER = '2026-11-02T11:00:00.000Z';

const account = async (login: string): Promise<AccountRecord> => ({
  accountId: randomUUID(),
  login,
  passwordHash: await hashPassword('a long enough phrase'),
  displayName: 'Seren',
  createdAt: NOW,
  passwordChangedAt: NOW,
});

/** A used DM invitation of a campaign, as a seat's origin. */
async function usedInvitation(credentials: PostgresCredentialStore, campaignId: string) {
  const invitationId = randomUUID();
  await credentials.createInvitation({
    invitationId,
    tokenHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
    campaignId,
    purpose: 'dm',
    characterId: null,
    createdBy: 'operator',
    createdAt: NOW,
    expiresAt: LATER,
    actorId: 'dm-ravenford',
  });
  return invitationId;
}

describe('PostgresAccountStore', () => {
  it('keeps a login once, and a seat once per campaign and per actor', async () => {
    const store = new PostgresAccountStore(pool);
    const credentials = new PostgresCredentialStore(pool);
    const seren = await account('seren');
    expect(await store.createAccount(seren)).toBe(true);
    expect(await store.createAccount(await account('seren'))).toBe(false);
    expect((await store.findByLogin('seren'))?.accountId).toBe(seren.accountId);
    const invitationId = await usedInvitation(credentials, 'ravenford');
    const seat = {
      accountId: seren.accountId,
      campaignId: 'ravenford',
      actorId: 'dm-ravenford',
      role: 'dm' as const,
      invitationId,
      joinedAt: NOW,
    };
    expect(await store.addSeat(seat)).toBe(true);
    expect(await store.addSeat({ ...seat, actorId: 'player:other' })).toBe(false);
    const other = await account('other');
    await store.createAccount(other);
    expect(await store.addSeat({ ...seat, accountId: other.accountId })).toBe(false);
    expect((await store.seatOfActor('ravenford', 'dm-ravenford'))?.accountId).toBe(seren.accountId);
    expect(await store.removeSeats('ravenford', 'dm-ravenford')).toBe(1);
    expect(await store.seats(seren.accountId)).toEqual([]);
  });

  it('revokes sessions one way and uses a reset once', async () => {
    const store = new PostgresAccountStore(pool);
    const seren = await account('seren');
    await store.createAccount(seren);
    const session = {
      sessionId: randomUUID(),
      tokenHash: 'a'.repeat(64),
      accountId: seren.accountId,
      createdAt: NOW,
      expiresAt: '2026-11-20T10:00:00.000Z',
    };
    await store.createSession(session);
    await store.createSession({ ...session, sessionId: randomUUID(), tokenHash: 'b'.repeat(64) });
    expect(await store.revokeSessions(seren.accountId, LATER, 'b'.repeat(64))).toBe(1);
    expect((await store.findSession('b'.repeat(64)))?.revokedAt).toBeNull();
    await expect(
      pool.query(`UPDATE ltw_account_sessions SET revoked_at = NULL WHERE token_hash = $1`, [
        'a'.repeat(64),
      ]),
    ).rejects.toThrow(/one way/);
    await store.createReset({
      resetId: randomUUID(),
      tokenHash: 'c'.repeat(64),
      accountId: seren.accountId,
      createdBy: 'operator',
      createdAt: NOW,
      expiresAt: '2026-11-04T10:00:00.000Z',
    });
    const [first, second] = await Promise.all([
      store.useReset('c'.repeat(64), LATER),
      store.useReset('c'.repeat(64), LATER),
    ]);
    expect([first, second].filter((used) => used !== null)).toEqual([seren.accountId]);
  });

  it('mints a campaign session only from a used invitation of that campaign', async () => {
    const credentials = new PostgresCredentialStore(pool);
    const invitationId = await usedInvitation(credentials, 'ravenford');
    const session = {
      sessionId: randomUUID(),
      tokenHash: 'd'.repeat(64),
      campaignId: 'ravenford',
      actorId: 'dm-ravenford',
      invitationId,
      createdAt: NOW,
      expiresAt: LATER,
    };
    await expect(credentials.createSession(session)).rejects.toThrow(/used invitation/);
    await pool.query(`UPDATE ltw_auth_invitations SET used_at = $2 WHERE invitation_id = $1`, [
      invitationId,
      NOW,
    ]);
    await expect(
      credentials.createSession({ ...session, campaignId: 'other-table' }),
    ).rejects.toThrow(/used invitation/);
    await credentials.createSession(session);
    expect((await credentials.findSession('d'.repeat(64)))?.actorId).toBe('dm-ravenford');
  });
});
