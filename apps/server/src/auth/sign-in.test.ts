import type { MembershipResponse, SessionResponse } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { withoutRequestId } from '../testing/ravenford-app.ts';
import {
  FlakyCredentialStore,
  OTHER_CAMPAIGN,
  SEREN,
  sessionCookieOf,
  signInTable,
  type SignInTable,
} from '../testing/sign-in.ts';
import { InMemoryCredentialStore } from './credential-store.ts';
import { SESSION_MS } from './sign-in.ts';
import { newToken } from './tokens.ts';

/**
 * Production sign-in over HTTP (docs/adr/0036-production-sign-in.md §1–3, §5;
 * docs/STAGE_340_DESIGN.md "Flows", "Request checks"): invitations redeemed once for a strict
 * session cookie bound to one actor in one campaign; everything forged, expired, revoked, used,
 * replayed or foreign fails closed, the same way every time.
 */
const UNAUTHENTICATED = {
  status: 401,
  error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
};
const NOT_FOUND = { status: 404, error: { code: 'NOT_FOUND', message: 'Not found' } };
const HOUR = 60 * 60_000;

async function dmAndPlayer(table: SignInTable) {
  const dm = await table.signInWith(await table.dmInvitation());
  const { invitation, token } = await table.invite(dm, SEREN);
  const player = await table.signInWith(token);
  return { dm, player, invitation };
}

const sessionOf = async (table: SignInTable, cookie: string) =>
  (await table.send('GET', '/campaigns/ravenford/session', { cookie })).json<SessionResponse>();

describe('redeeming an invitation', () => {
  it('signs the DM in from the operator’s invitation with a strict cookie, once', async () => {
    const table = await signInTable();
    const token = await table.dmInvitation();
    const response = await table.redeem(token);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ campaignId: 'ravenford' });
    expect(response.headers['set-cookie']).toMatch(
      /^ltw_session=[A-Za-z0-9_-]{43}; Path=\/api; HttpOnly; SameSite=Strict; Max-Age=1209600; Secure$/,
    );
    const cookie = sessionCookieOf(response) ?? '';
    expect(response.body).not.toContain(token);
    expect(response.body).not.toContain(cookie.slice('ltw_session='.length));
    expect((await table.send('GET', '/auth/session', { cookie })).json()).toEqual({
      campaignId: 'ravenford',
    });
    expect(await sessionOf(table, cookie)).toMatchObject({ actorId: 'dm-ravenford', role: 'DM' });
    // Single use: the same link never signs anyone in again.
    expect(withoutRequestId(await table.redeem(token))).toEqual(UNAUTHENTICATED);
  });

  it('seats an invited player as a fresh actor through the World Engine', async () => {
    const table = await signInTable();
    const { player, invitation } = await dmAndPlayer(table);
    expect(invitation.link).toMatch(/^https:\/\/table\.example\/join#[A-Za-z0-9_-]{43}$/);
    expect(invitation.expiresAt).toBe(new Date(table.clock.now() + 72 * HOUR).toISOString());
    const session = await sessionOf(table, player);
    expect(session).toMatchObject({ role: 'PLAYER', character: { entityId: SEREN } });
    expect(session.actorId).toMatch(/^player:[0-9a-f-]{36}$/);
    // Membership changed only through the World Engine, by the sign-in system actor.
    const log = await table.engine.commandLog('ravenford');
    const seat = log.find((stored) => stored.commandId === `invite:${invitation.invitationId}`);
    expect(seat).toMatchObject({
      commandType: 'AssignCharacter',
      actor: { actorId: 'sign-in', kind: 'system' },
      command: { type: 'AssignCharacter', characterId: SEREN, playerActorId: session.actorId },
    });
    const knowledge = await table.send('GET', '/campaigns/ravenford/knowledge?perspective=PARTY', {
      cookie: player,
    });
    expect(knowledge.statusCode).toBe(200);
  });

  it('refuses forged, expired, revoked, used and replayed invitations alike', async () => {
    const table = await signInTable();
    const dm = await table.signInWith(await table.dmInvitation());
    const roster = async () => [...((await table.engine.load('ravenford'))?.state.roster ?? [])];
    const before = await roster();

    const expired = await table.invite(dm, SEREN, 'ravenford', 1);
    const revoked = await table.invite(dm, SEREN);
    const used = await table.invite(dm, SEREN);
    expect(
      (
        await table.send(
          'POST',
          `/campaigns/ravenford/invitations/${revoked.invitation.invitationId}/revoke`,
          { cookie: dm },
          {},
        )
      ).statusCode,
    ).toBe(200);
    table.clock.advance(HOUR);
    const answers = [
      await table.redeem(newToken()),
      await table.redeem(expired.token),
      await table.redeem(revoked.token),
    ];
    expect(await roster()).toEqual(before);
    await table.signInWith(used.token);
    answers.push(await table.redeem(used.token), await table.redeem(used.token));
    for (const answer of answers) {
      expect(withoutRequestId(answer)).toEqual(UNAUTHENTICATED);
      expect(answer.headers['set-cookie']).toBeUndefined();
    }
    // A malformed body is a 400, as everywhere (ADR 0009).
    for (const body of [{}, { token: 'short' }, { token: used.token, extra: 1 }, { token: 7 }]) {
      expect((await table.send('POST', '/auth/redeem', {}, body)).statusCode).toBe(400);
    }
  });

  it('gives a seat once: taking it revokes the character’s other open invitations', async () => {
    const table = await signInTable();
    const dm = await table.signInWith(await table.dmInvitation());
    const first = await table.invite(dm, SEREN);
    const second = await table.invite(dm, SEREN);
    await table.signInWith(second.token);
    expect(withoutRequestId(await table.redeem(first.token))).toEqual(UNAUTHENTICATED);
    // Inviting for a seat that is taken is a conflict.
    const again = await table.send(
      'POST',
      '/campaigns/ravenford/invitations',
      { cookie: dm },
      { characterId: SEREN },
    );
    expect(again.statusCode).toBe(409);
  });
});

describe('sessions', () => {
  it('fail closed when forged, expired, signed out, ambiguous or a persona token', async () => {
    const table = await signInTable();
    const { player } = await dmAndPlayer(table);
    const url = '/campaigns/ravenford/knowledge?perspective=PARTY';
    const refused = async (caller: Parameters<SignInTable['send']>[2]) => {
      const answer = await table.send('GET', url, caller);
      expect(withoutRequestId(answer)).toEqual(UNAUTHENTICATED);
    };
    await refused({});
    await refused({ cookie: `ltw_session=${newToken()}` });
    await refused({ cookie: `${player}; ltw_session=${newToken()}` });
    await refused({ headers: { authorization: 'Bearer dev-dm-ravenford' } });
    expect((await table.send('GET', url, { cookie: `theme=dark; ${player}` })).statusCode).toBe(
      200,
    );

    table.clock.advance(SESSION_MS - 1);
    expect((await table.send('GET', url, { cookie: player })).statusCode).toBe(200);
    table.clock.advance(1);
    await refused({ cookie: player });
    expect(withoutRequestId(await table.send('GET', '/auth/session', { cookie: player }))).toEqual(
      UNAUTHENTICATED,
    );
  });

  it('ends at sign-out without a response that could erase a newer cookie', async () => {
    const table = await signInTable();
    const { player } = await dmAndPlayer(table);
    const out = await table.send('POST', '/auth/sign-out', { cookie: player });
    expect(out.statusCode).toBe(204);
    expect(out.headers['set-cookie']).toBeUndefined();
    expect((await table.send('GET', '/auth/session', { cookie: player })).statusCode).toBe(401);
    expect((await table.send('POST', '/auth/sign-out', { cookie: player })).statusCode).toBe(401);
  });

  it('replace the browser’s earlier session when it signs in again and confirms it', async () => {
    const table = await signInTable();
    const first = await table.signInWith(await table.dmInvitation());
    // Without the confirmation: 409, nothing spent (sign-in-cookies.test.ts).
    expect((await table.redeem(await table.dmInvitation(), { cookie: first })).statusCode).toBe(
      409,
    );
    const second = await table.signInWith(
      await table.dmInvitation(),
      { cookie: first },
      { replaceSession: true },
    );
    expect((await table.send('GET', '/auth/session', { cookie: first })).statusCode).toBe(401);
    expect((await table.send('GET', '/auth/session', { cookie: second })).statusCode).toBe(200);
  });

  it('record when they were last seen, at most every five minutes', async () => {
    const table = await signInTable();
    const { dm, player } = await dmAndPlayer(table);
    const seen = async () =>
      (await table.send('GET', '/campaigns/ravenford/invitations', { cookie: dm }))
        .json<MembershipResponse>()
        .members.find((member) => member.characterId === SEREN)?.lastSeenAt;
    const signedIn = new Date(table.clock.now()).toISOString();
    expect(await seen()).toBe(signedIn);
    table.clock.advance(4 * 60_000);
    await sessionOf(table, player);
    expect(await seen()).toBe(signedIn);
    table.clock.advance(60_000);
    await sessionOf(table, player);
    expect(await seen()).toBe(new Date(table.clock.now()).toISOString());
  });
});

describe('a session opens its own campaign only', () => {
  it('answers another campaign as a non-member, even where its actor is the DM', async () => {
    const table = await signInTable();
    const { dm, player } = await dmAndPlayer(table);
    const nowhere = await table.send('GET', '/campaigns/nowhere/session', { cookie: dm });
    expect(withoutRequestId(nowhere)).toEqual(NOT_FOUND);
    // dm-ravenford is also the DM of the other table, but this session is Ravenford's.
    for (const cookie of [dm, player]) {
      for (const path of ['session', 'knowledge?perspective=PUBLIC', 'invitations']) {
        const foreign = await table.send('GET', `/campaigns/${OTHER_CAMPAIGN}/${path}`, { cookie });
        expect(withoutRequestId(foreign)).toEqual(NOT_FOUND);
      }
    }
    const created = await table.send(
      'POST',
      `/campaigns/${OTHER_CAMPAIGN}/invitations`,
      { cookie: dm },
      { characterId: 'other-hero' },
    );
    expect(withoutRequestId(created)).toEqual(NOT_FOUND);
    // The other table's own DM session reads it, and nothing of Ravenford.
    const other = await table.signInWith(await table.dmInvitation(OTHER_CAMPAIGN));
    expect(
      (await table.send('GET', `/campaigns/${OTHER_CAMPAIGN}/session`, { cookie: other }))
        .statusCode,
    ).toBe(200);
    expect(
      withoutRequestId(await table.send('GET', '/campaigns/ravenford/session', { cookie: other })),
    ).toEqual(NOT_FOUND);
  });

  it('keeps the ADR 0009 order: 401, then 400, then 404, then 403', async () => {
    const table = await signInTable();
    const { player } = await dmAndPlayer(table);
    const status = async (url: string, cookie?: string) =>
      (await table.send('GET', url, cookie === undefined ? {} : { cookie })).statusCode;
    expect(await status(`/campaigns/${OTHER_CAMPAIGN}/knowledge?perspective=BAD`)).toBe(401);
    expect(await status(`/campaigns/${OTHER_CAMPAIGN}/knowledge?perspective=BAD`, player)).toBe(
      400,
    );
    expect(await status(`/campaigns/${OTHER_CAMPAIGN}/knowledge?perspective=DM`, player)).toBe(404);
    expect(await status('/campaigns/ravenford/knowledge?perspective=DM', player)).toBe(403);
    expect(await status('/campaigns/ravenford/knowledge?perspective=PLAYER', player)).toBe(200);
  });

  it('makes unknown, non-member and released campaigns indistinguishable', async () => {
    const table = await signInTable();
    const { player } = await dmAndPlayer(table);
    // Released through the World Engine without touching the session: it opens nothing.
    const released = await table.engine.execute({
      commandId: 'release-direct',
      campaignId: 'ravenford',
      actor: { actorId: 'dm-ravenford', kind: 'user' },
      command: { type: 'ReleaseCharacter', characterId: SEREN },
    });
    expect(released.status).toBe('accepted');
    const answers = await Promise.all(
      ['ravenford', OTHER_CAMPAIGN, 'nowhere'].map((campaignId) =>
        table.send('GET', `/campaigns/${campaignId}/knowledge?perspective=PUBLIC`, {
          cookie: player,
        }),
      ),
    );
    for (const answer of answers) expect(withoutRequestId(answer)).toEqual(NOT_FOUND);
    expect((await table.send('GET', '/auth/session', { cookie: player })).statusCode).toBe(401);
  });
});

describe('a redeem that fails half way', () => {
  it('converges when retried: one seat, one assignment, the same actor', async () => {
    const flaky = new FlakyCredentialStore(new InMemoryCredentialStore());
    const table = await signInTable({ credentials: flaky });
    const dm = await table.signInWith(await table.dmInvitation());
    const { invitation, token } = await table.invite(dm, SEREN);
    flaky.failures = 1;
    expect((await table.redeem(token)).statusCode).toBe(500);
    const seatedFirst = (await table.engine.load('ravenford'))?.state.roster.get(SEREN);
    expect(seatedFirst).toMatch(/^player:/);
    const player = await table.signInWith(token);
    expect((await sessionOf(table, player)).actorId).toBe(seatedFirst);
    const seats = (await table.engine.commandLog('ravenford')).filter(
      (stored) => stored.commandId === `invite:${invitation.invitationId}`,
    );
    expect(seats).toHaveLength(1);
  });

  it('gives the seat back when the invitation is revoked while the seat is being taken', async () => {
    const flaky = new FlakyCredentialStore(new InMemoryCredentialStore());
    const table = await signInTable({ credentials: flaky });
    const dm = await table.signInWith(await table.dmInvitation());
    const { invitation, token } = await table.invite(dm, SEREN);
    flaky.beforeComplete = async () => {
      const revoked = await table.send(
        'POST',
        `/campaigns/ravenford/invitations/${invitation.invitationId}/revoke`,
        { cookie: dm },
        {},
      );
      expect(revoked.statusCode).toBe(200);
    };
    expect(withoutRequestId(await table.redeem(token))).toEqual(UNAUTHENTICATED);
    const state = (await table.engine.load('ravenford'))?.state;
    expect(state?.roster.has(SEREN)).toBe(false);
    expect(state?.commands.get(`invite:${invitation.invitationId}`)?.undoneBy).toBe(
      `invite:${invitation.invitationId}:undo`,
    );
    // The seat is free to be offered again.
    await table.signInWith((await table.invite(dm, SEREN)).token);
  });

  it('is single use under a race: one session, one seat', async () => {
    const table = await signInTable();
    const dm = await table.signInWith(await table.dmInvitation());
    const { token } = await table.invite(dm, SEREN);
    const answers = await Promise.all([1, 2, 3, 4].map(() => table.redeem(token)));
    expect(answers.map((answer) => answer.statusCode).sort()).toEqual([200, 401, 401, 401]);
    const members = (
      await table.send('GET', '/campaigns/ravenford/invitations', { cookie: dm })
    ).json<{ members: { characterId: string; activeSessions: number }[] }>().members;
    expect(members.find((member) => member.characterId === SEREN)?.activeSessions).toBe(1);
  });
});
