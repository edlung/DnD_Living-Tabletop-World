import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { hashToken, newToken } from '../auth/tokens.ts';
import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { issueWorkshopInvitation } from './service.ts';
import { PostgresWorkshopStore } from './postgres-store.ts';

let database: ThrowawayDatabase;
let pool: pg.Pool;
let store: PostgresWorkshopStore;
const T0 = '2026-10-30T10:00:00.000Z';
const T1 = '2026-10-30T11:00:00.000Z';
const SESSION_END = '2026-11-13T10:00:00.000Z';
beforeEach(async () => {
  database = await createThrowawayDatabase({ migrate: true });
  pool = new pg.Pool({ connectionString: database.url, max: 4 });
  store = new PostgresWorkshopStore(pool);
});
afterEach(async () => {
  await pool.end();
  await database.drop();
});

async function invitation(ownerId: string = randomUUID()) {
  const issued = await issueWorkshopInvitation(
    { store, publicOrigin: 'https://table.example', clock: { now: () => Date.parse(T0) } },
    { ownerId, hours: 24, authorizationSource: 'chat:stage-380' },
  );
  return { ...issued, token: issued.link.split('#')[1] ?? '' };
}
function session() {
  const token = newToken();
  return {
    token,
    record: {
      sessionId: randomUUID(),
      tokenHash: hashToken(token),
      createdAt: T0,
      expiresAt: SESSION_END,
    },
  };
}

describe('durable workshop authority', () => {
  it('rejects a session claiming another invitation owner and cannot truncate its audit history', async () => {
    const a = await invitation();
    const b = await invitation();
    await expect(
      pool.query(
        `INSERT INTO ltw_workshop_sessions
      (session_id, owner_id, invitation_id, token_hash, created_at, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), b.ownerId, a.invitationId, hashToken(newToken()), T0, SESSION_END],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(pool.query('TRUNCATE ltw_workshop_owners CASCADE')).rejects.toThrow('immutable');
    expect((await pool.query('SELECT * FROM ltw_workshop_invitations')).rowCount).toBe(2);
  });
  it('survives a store restart, stores hashes only, and cannot rewrite credentials/ownership', async () => {
    const invite = await invitation();
    const login = session();
    expect(await store.redeem(hashToken(invite.token), login.record, null)).toBe(invite.ownerId);
    const restarted = new PostgresWorkshopStore(pool);
    expect(await restarted.session(hashToken(login.token), T1)).toMatchObject({
      ownerId: invite.ownerId,
    });
    const content = JSON.stringify(
      (await pool.query('SELECT * FROM ltw_workshop_invitations')).rows,
    );
    expect(content).not.toContain(invite.token);
    expect(content).not.toContain(login.token);
    expect(content).toContain('chat:stage-380');
    await expect(
      pool.query('UPDATE ltw_workshop_sessions SET token_hash = $1', [hashToken(newToken())]),
    ).rejects.toThrow();
    await expect(
      pool.query('UPDATE ltw_workshop_owners SET owner_id = $1', [randomUUID()]),
    ).rejects.toThrow();
    await store.signOut(login.record.tokenHash, T1);
    await expect(
      pool.query('UPDATE ltw_workshop_sessions SET revoked_at = NULL'),
    ).rejects.toThrow();
    expect(await restarted.session(login.record.tokenHash, T1)).toBeNull();
  });

  it('spends an invitation exactly once under concurrent redemption', async () => {
    const invite = await invitation();
    const a = session();
    const b = session();
    const results = await Promise.all([
      store.redeem(hashToken(invite.token), a.record, null),
      new PostgresWorkshopStore(pool).redeem(hashToken(invite.token), b.record, null),
    ]);
    expect(results.filter((owner) => owner === invite.ownerId)).toHaveLength(1);
    expect(results.filter((owner) => owner === null)).toHaveLength(1);
    expect((await pool.query('SELECT * FROM ltw_workshop_sessions')).rowCount).toBe(1);
  });

  it('a concurrent owner revoke leaves neither a usable invitation nor a new session', async () => {
    const invite = await invitation();
    const login = session();
    await Promise.all([
      store.redeem(hashToken(invite.token), login.record, null),
      new PostgresWorkshopStore(pool).revokeOwner(invite.ownerId, T0, 'chat:revoke'),
    ]);
    expect(await store.session(login.record.tokenHash, T1)).toBeNull();
    expect(await store.redeem(hashToken(invite.token), session().record, null)).toBeNull();
    expect(
      (await pool.query('SELECT authorization_source FROM ltw_workshop_revocations')).rows[0],
    ).toEqual({ authorization_source: 'chat:revoke' });
    const granted = await invitation(invite.ownerId);
    const fresh = session();
    expect(await store.redeem(hashToken(granted.token), fresh.record, null)).toBe(invite.ownerId);
  });

  it('retries draft creation across connections and keeps all metadata owner-qualified', async () => {
    const a = await invitation();
    const b = await invitation();
    const input = { requestId: randomUUID(), title: 'Колокол подо льдом', language: 'ru' as const };
    const [first, retried] = await Promise.all([
      store.createDraft(a.ownerId, input, randomUUID(), T0),
      new PostgresWorkshopStore(pool).createDraft(a.ownerId, input, randomUUID(), T0),
    ]);
    expect(first).toEqual(retried);
    expect(first.kind).toBe('created');
    if (first.kind !== 'created') throw new Error('missing draft');
    expect(await store.draft(b.ownerId, first.draft.draftId)).toBeNull();
    expect(await store.drafts(b.ownerId, null, 51)).toEqual([]);
    expect(
      await store.createDraft(a.ownerId, { ...input, title: 'Other' }, randomUUID(), T0),
    ).toEqual({ kind: 'conflict' });
    const sameRequestOtherOwner = await store.createDraft(b.ownerId, input, randomUUID(), T0);
    expect(sameRequestOtherOwner.kind).toBe('created');
    const another = await store.createDraft(
      a.ownerId,
      { ...input, requestId: randomUUID() },
      randomUUID(),
      T1,
    );
    expect(another.kind).toBe('created');
    const page = await store.drafts(a.ownerId, null, 1);
    expect(page[0]?.createdAt).toBe(T1);
    expect(await store.drafts(a.ownerId, page[0] ?? null, 1)).toEqual([first.draft]);
    await expect(
      pool.query('UPDATE ltw_workshop_drafts SET owner_id = $1', [b.ownerId]),
    ).rejects.toThrow();
  });

  it('refuses expired sessions and sanitizes database errors without leaking hashes', async () => {
    const invite = await invitation();
    const login = session();
    await store.redeem(hashToken(invite.token), login.record, null);
    expect(await store.session(login.record.tokenHash, SESSION_END)).toBeNull();
    // Reusing an invitation ID would put a hash in PostgreSQL's raw detail; it must not escape.
    await expect(
      store.issueInvitation({
        invitationId: invite.invitationId,
        ownerId: invite.ownerId,
        tokenHash: login.record.tokenHash,
        createdAt: T0,
        expiresAt: T1,
        authorizationSource: 'chat:380',
      }),
    ).rejects.toThrow('WORKSHOP_STORAGE_UNAVAILABLE');
  });
});
