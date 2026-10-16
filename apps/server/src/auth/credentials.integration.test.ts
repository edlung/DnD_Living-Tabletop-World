import { randomUUID } from 'node:crypto';

import type { MembershipResponse } from '@ltw/contracts';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { seededEngine } from '../testing/ravenford-app.ts';
import { ORIGIN, OTHER_CAMPAIGN, SEREN, signInTable } from '../testing/sign-in.ts';
import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';
import { createWorldEngine } from '../world-engine/runtime.ts';
import { issueDmInvitation, parseAuthOperatorArgs, runAuthOperatorCommand } from './operator.ts';
import { PostgresCredentialStore } from './postgres-credential-store.ts';
import { hashToken, newToken } from './tokens.ts';

/**
 * Credentials on PostgreSQL (migration 0010_auth.sql; docs/adr/0036-production-sign-in.md):
 * hashes only, formats checked by the table, one-way changes enforced below the application,
 * one session per invitation however redeems race, and sign-in that survives a restart.
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

const T0 = '2026-10-15T18:00:00.000Z';
const at = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000).toISOString();

function invitation(changes: Record<string, unknown> = {}) {
  return {
    invitationId: randomUUID(),
    tokenHash: hashToken(newToken()),
    campaignId: 'ravenford',
    purpose: 'player' as const,
    characterId: SEREN,
    createdBy: 'dm-ravenford',
    createdAt: T0,
    expiresAt: at(72 * 60),
    actorId: null,
    ...changes,
  };
}

const session = (invitationId: string) => ({
  sessionId: randomUUID(),
  tokenHash: hashToken(newToken()),
  campaignId: 'ravenford',
  actorId: 'player:1',
  invitationId,
  createdAt: at(1),
  expiresAt: at(1 + 14 * 24 * 60),
});

describe('the credential tables', () => {
  it('hold hashes only, in the formats and bounds the design sets', async () => {
    const store = new PostgresCredentialStore(pool);
    await store.createInvitation(invitation());
    for (const bad of [
      { tokenHash: newToken() },
      { campaignId: 'Raven Ford' },
      { purpose: 'dm' },
      { purpose: 'admin' },
      { characterId: null },
      { expiresAt: at(8 * 24 * 60) },
      { expiresAt: T0 },
      { createdBy: 'not an actor' },
    ]) {
      await expect(store.createInvitation(invitation(bad)), JSON.stringify(bad)).rejects.toThrow();
    }
    const dm = invitation({ purpose: 'dm', characterId: null, actorId: 'dm-ravenford' });
    await store.createInvitation(dm);
    await expect(store.createInvitation(invitation({ tokenHash: dm.tokenHash }))).rejects.toThrow();
    const columns = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name IN ('ltw_auth_invitations', 'ltw_auth_sessions', 'ltw_auth_attempts')`,
    );
    expect(columns.rows.map((row) => row.column_name)).not.toContain('token');
  });

  it('change one way only: nothing comes back to life, an invitation is never deleted', async () => {
    const store = new PostgresCredentialStore(pool);
    const open = invitation();
    await store.createInvitation(open);
    expect(await store.claimActor(open.invitationId, 'player:1')).toBe('player:1');
    expect(await store.claimActor(open.invitationId, 'player:2')).toBe('player:1');
    const created = session(open.invitationId);
    expect(await store.completeRedeem(open.invitationId, created, at(1))).toBe(true);
    expect(await store.revokeSession(created.tokenHash, at(2))).toBe(true);
    for (const statement of [
      'UPDATE ltw_auth_invitations SET used_at = NULL',
      "UPDATE ltw_auth_invitations SET actor_id = 'player:2'",
      "UPDATE ltw_auth_invitations SET expires_at = expires_at + interval '1 day'",
      'UPDATE ltw_auth_sessions SET revoked_at = NULL',
      "UPDATE ltw_auth_sessions SET last_seen_at = last_seen_at - interval '1 minute'",
      "UPDATE ltw_auth_sessions SET actor_id = 'dm-ravenford'",
      'DELETE FROM ltw_auth_invitations',
    ]) {
      await expect(pool.query(statement), statement).rejects.toThrow(/one way|never deleted/);
    }
  });

  it('settle racing redeems of one invitation on exactly one session', async () => {
    const stores = [1, 2, 3, 4].map(() => new PostgresCredentialStore(pool));
    const open = invitation({ actorId: 'player:1' });
    await stores[0]?.createInvitation(open);
    const results = await Promise.all(
      stores.map((store) =>
        store.completeRedeem(open.invitationId, session(open.invitationId), at(1)),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    const count = await pool.query('SELECT count(*)::int AS n FROM ltw_auth_sessions');
    expect(count.rows[0]).toEqual({ n: 1 });
  });

  it('refuse a redeem of an expired or revoked invitation, and revoke a taken seat’s others', async () => {
    const store = new PostgresCredentialStore(pool);
    const expiring = invitation({ actorId: 'player:1', expiresAt: at(60) });
    const sibling = invitation();
    await store.createInvitation(expiring);
    await store.createInvitation(sibling);
    expect(
      await store.completeRedeem(expiring.invitationId, session(expiring.invitationId), at(60)),
    ).toBe(false);
    const taken = invitation({ actorId: 'player:3' });
    await store.createInvitation(taken);
    expect(await store.completeRedeem(taken.invitationId, session(taken.invitationId), at(2))).toBe(
      true,
    );
    expect(await store.revokeInvitation('ravenford', sibling.invitationId, at(3))).toBe(
      'already-revoked',
    );
    expect(await store.revokeInvitation('ravenford', taken.invitationId, at(3))).toBe('used');
    expect(await store.revokeInvitation('other-table', taken.invitationId, at(3))).toBe('missing');
  });

  it('prune old evidence and long-dead sessions only', async () => {
    const store = new PostgresCredentialStore(pool);
    const open = invitation({ actorId: 'player:1' });
    await store.createInvitation(open);
    await store.completeRedeem(open.invitationId, session(open.invitationId), at(1));
    const key = 'a'.repeat(64);
    await store.recordAttempt({ at: T0, outcome: 'refused', sourceKey: key, prefixKey: null });
    await store.recordAttempt({ at: at(60), outcome: 'redeemed', sourceKey: key, prefixKey: key });
    await expect(
      store.recordAttempt({
        at: T0,
        outcome: 'refused',
        sourceKey: '198.51.100.1',
        prefixKey: null,
      }),
    ).rejects.toThrow();
    expect(await store.prune({ attemptsBefore: at(30), sessionsExpiredBefore: at(60) })).toEqual({
      attempts: 1,
      sessions: 0,
    });
    expect(
      await store.prune({ attemptsBefore: at(30), sessionsExpiredBefore: at(15 * 24 * 60) }),
    ).toEqual({ attempts: 0, sessions: 1 });
    expect(await store.attempts()).toHaveLength(1);
  });
});

describe('sign-in on PostgreSQL', () => {
  it('works end to end, and a restarted server keeps sessions and revocations', async () => {
    const engine = await seededEngine();
    const first = await signInTable({ engine, credentials: new PostgresCredentialStore(pool) });
    const dm = await first.signInWith(await first.dmInvitation());
    const { token } = await first.invite(dm, SEREN);
    const player = await first.signInWith(token);
    expect((await first.redeem(token)).statusCode).toBe(401);
    const signedOut = await first.signInWith(await first.dmInvitation());
    expect((await first.send('POST', '/auth/sign-out', { cookie: signedOut })).statusCode).toBe(
      204,
    );
    await first.app.close();

    // A new process over the same database: the same engine state, a fresh store object.
    const second = await signInTable({ engine, credentials: new PostgresCredentialStore(pool) });
    expect((await second.send('GET', '/auth/session', { cookie: player })).statusCode).toBe(200);
    expect((await second.send('GET', '/auth/session', { cookie: signedOut })).statusCode).toBe(401);
    const listed = (
      await second.send('GET', '/campaigns/ravenford/invitations', { cookie: dm })
    ).json<MembershipResponse>();
    expect(listed.members.find((member) => member.characterId === SEREN)?.activeSessions).toBe(1);
    const revoked = await second.send(
      'POST',
      `/campaigns/ravenford/members/${SEREN}/revoke`,
      { cookie: dm },
      {},
    );
    expect(revoked.json()).toEqual({ released: true, sessionsRevoked: 1, invitationsRevoked: 0 });
    expect((await second.send('GET', '/auth/session', { cookie: player })).statusCode).toBe(401);
    const evidence = await new PostgresCredentialStore(pool).attempts();
    expect(evidence.map((attempt) => attempt.outcome)).toContain('refused');
    await second.app.close();
  });

  it('issues the operator’s DM invitation against the PostgreSQL World Engine', async () => {
    const engine = createWorldEngine(pool);
    for (const submission of (await loadRavenfordSeed()).submissions) {
      const result = await engine.execute(submission);
      expect(result.status).not.toBe('rejected');
    }
    const credentials = new PostgresCredentialStore(pool);
    const issued = await issueDmInvitation(
      engine,
      { credentials, publicOrigin: 'https://table.example', clock: { now: () => Date.parse(T0) } },
      { kind: 'dm-invite', campaignId: 'ravenford', expiresHours: 24 },
    );
    const token = issued.link.slice(issued.link.indexOf('#') + 1);
    const stored = await credentials.findInvitation(hashToken(token));
    expect(stored).toMatchObject({
      purpose: 'dm',
      actorId: 'dm-ravenford',
      expiresAt: at(24 * 60),
    });
    const rows = await pool.query('SELECT * FROM ltw_auth_invitations');
    expect(JSON.stringify(rows.rows)).not.toContain(token);
  });
});

describe('the operator on PostgreSQL', () => {
  it('lists live sessions without secrets, revokes the DM per campaign and an actor everywhere', async () => {
    const engine = await seededEngine();
    const credentials = new PostgresCredentialStore(pool);
    const table = await signInTable({ engine, credentials });
    const laptop = await table.signInWith(await table.dmInvitation());
    const phone = await table.signInWith(await table.dmInvitation());
    const elsewhere = await table.signInWith(await table.dmInvitation(OTHER_CAMPAIGN));
    const player = await table.signInWith((await table.invite(laptop, SEREN)).token);
    const spare = await table.dmInvitation();
    const run = (argv: readonly string[]) =>
      runAuthOperatorCommand(
        engine,
        { credentials, clock: table.clock, publicOrigin: ORIGIN },
        parseAuthOperatorArgs(argv),
      );
    const status = async (cookie: string) =>
      (await table.send('GET', '/auth/session', { cookie })).statusCode;
    const source = ['--authorization-source', 'owner message 2026-10-16'];

    const listed = (await run(['sessions', '--campaign', 'ravenford'])) as {
      sessions: readonly { role: string; characterIds: readonly string[] }[];
    };
    expect(listed.sessions.map((session) => session.role).sort()).toEqual(['dm', 'dm', 'player']);
    const text = JSON.stringify(listed);
    for (const cookie of [laptop, phone, player]) {
      const token = cookie.slice('ltw_session='.length);
      expect(text).not.toContain(token);
      expect(text).not.toContain(hashToken(token));
    }
    expect(text).not.toMatch(/token|hash/i);

    expect(await run(['revoke-dm', '--campaign', 'ravenford', ...source])).toEqual({
      campaignId: 'ravenford',
      actorId: 'dm-ravenford',
      sessionsRevoked: 2,
      invitationsRevoked: 1,
      authorizationSource: 'owner message 2026-10-16',
    });
    expect([await status(laptop), await status(phone), await status(elsewhere)]).toEqual([
      401, 401, 200,
    ]);
    expect((await table.redeem(spare)).statusCode).toBe(401);
    expect(await status(player)).toBe(200);

    expect(await run(['revoke-actor', '--actor', 'dm-ravenford', ...source])).toMatchObject({
      sessionsRevoked: 1,
      invitationsRevoked: 0,
    });
    expect(await status(elsewhere)).toBe(401);
    expect(await status(player)).toBe(200);
    const revoked = await pool.query<{ count: string }>(
      'SELECT count(*) FROM ltw_auth_sessions WHERE revoked_at IS NOT NULL',
    );
    expect(revoked.rows[0]?.count).toBe('3');
    await table.app.close();
  });
});
