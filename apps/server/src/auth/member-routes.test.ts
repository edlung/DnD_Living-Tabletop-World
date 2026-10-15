import type { CommandResult, MembershipResponse, RevokeMemberResponse } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { withoutRequestId } from '../testing/ravenford-app.ts';
import { OTHER_CAMPAIGN, SEREN, signInTable, type SignInTable } from '../testing/sign-in.ts';
import { hashToken } from './tokens.ts';

/**
 * The DM's members and invitations (docs/adr/0036-production-sign-in.md §4;
 * docs/STAGE_340_DESIGN.md "Flows", "Revocation"): DM only, in the ADR 0009 order, never a
 * token, a hash or a player's actor ID; a revoked member is out at once and the seat is free.
 */
const NOT_FOUND = { status: 404, error: { code: 'NOT_FOUND', message: 'Not found' } };

async function table(): Promise<SignInTable & { readonly dm: string }> {
  const created = await signInTable();
  return { ...created, dm: await created.signInWith(await created.dmInvitation()) };
}

const list = async (t: SignInTable & { readonly dm: string }) => {
  const response = await t.send('GET', '/campaigns/ravenford/invitations', { cookie: t.dm });
  expect(response.statusCode).toBe(200);
  return response.json<MembershipResponse>();
};

describe('the DM’s list', () => {
  it('shows invitations with their status and members with their sessions, nothing secret', async () => {
    const t = await table();
    const pending = await t.invite(t.dm, SEREN);
    const used = await t.invite(t.dm, SEREN);
    const player = await t.signInWith(used.token);
    const response = await t.send('GET', '/campaigns/ravenford/invitations', { cookie: t.dm });
    const body = response.json<MembershipResponse>();
    expect(body.invitations.map((invitation) => [invitation.purpose, invitation.status])).toEqual([
      ['player', 'used'],
      ['player', 'revoked'],
      ['dm', 'used'],
    ]);
    expect(body.invitations[1]).toMatchObject({
      invitationId: pending.invitation.invitationId,
      characterId: SEREN,
      usedAt: null,
    });
    expect(
      body.members.map(({ characterId, activeSessions }) => [characterId, activeSessions]),
    ).toEqual([
      ['elowen-starwhisper', 0],
      [SEREN, 1],
    ]);
    expect(body.members.map((member) => member.lastSeenAt)).toEqual([
      null,
      new Date(t.clock.now()).toISOString(),
    ]);
    const actorId = (await t.engine.load('ravenford'))?.state.roster.get(SEREN) ?? 'none';
    for (const secret of [
      pending.token,
      used.token,
      hashToken(pending.token),
      player.slice('ltw_session='.length),
      actorId,
      'player-elowen',
    ]) {
      expect(response.body).not.toContain(secret);
    }
  });

  it('marks an unused invitation expired once its time is over', async () => {
    const t = await table();
    await t.invite(t.dm, SEREN, 'ravenford', 2);
    t.clock.advance(2 * 60 * 60_000);
    expect((await list(t)).invitations[0]?.status).toBe('expired');
  });
});

describe('revoking an invitation', () => {
  it('stops it working; a used one is a conflict; another campaign’s is missing', async () => {
    const t = await table();
    const open = await t.invite(t.dm, SEREN);
    const revoke = (campaignId: string, invitationId: string) =>
      t.send(
        'POST',
        `/campaigns/${campaignId}/invitations/${invitationId}/revoke`,
        { cookie: t.dm },
        {},
      );
    const first = await revoke('ravenford', open.invitation.invitationId);
    expect(first.json()).toEqual({ status: 'revoked' });
    expect((await revoke('ravenford', open.invitation.invitationId)).statusCode).toBe(200);
    expect((await t.redeem(open.token)).statusCode).toBe(401);

    const used = await t.invite(t.dm, SEREN);
    await t.signInWith(used.token);
    expect((await revoke('ravenford', used.invitation.invitationId)).statusCode).toBe(409);

    // The other table's invitation, named through Ravenford's route, is not found.
    const otherDm = await t.signInWith(await t.dmInvitation(OTHER_CAMPAIGN));
    const other = await t.invite(otherDm, 'other-hero', OTHER_CAMPAIGN);
    expect(withoutRequestId(await revoke('ravenford', other.invitation.invitationId))).toEqual(
      NOT_FOUND,
    );
    expect(
      withoutRequestId(await revoke('ravenford', '6f1c2a5e-1b8f-4c1e-9e55-5d9f7f2b3a10')),
    ).toEqual(NOT_FOUND);
    expect((await t.redeem(other.token)).statusCode).toBe(200);
  });
});

describe('revoking a member', () => {
  it('signs the player out, frees the seat through ReleaseCharacter, and lets it be offered again', async () => {
    const t = await table();
    const first = await t.invite(t.dm, SEREN);
    const player = await t.signInWith(first.token);
    const response = await t.send(
      'POST',
      `/campaigns/ravenford/members/${SEREN}/revoke`,
      { cookie: t.dm },
      {},
    );
    expect(response.json<RevokeMemberResponse>()).toEqual({
      released: true,
      sessionsRevoked: 1,
      invitationsRevoked: 0,
    });
    expect((await t.send('GET', '/auth/session', { cookie: player })).statusCode).toBe(401);
    const log = await t.engine.commandLog('ravenford');
    expect(log.at(-1)).toMatchObject({
      commandType: 'ReleaseCharacter',
      actor: { actorId: 'dm-ravenford', kind: 'user' },
    });
    expect((await list(t)).members.map((member) => member.characterId)).toEqual([
      'elowen-starwhisper',
    ]);
    // The seat can be offered again, to someone new.
    const again = await t.invite(t.dm, SEREN);
    const newcomer = await t.signInWith(again.token);
    expect((await t.send('GET', '/auth/session', { cookie: newcomer })).statusCode).toBe(200);
    expect((await t.send('GET', '/auth/session', { cookie: player })).statusCode).toBe(401);
  });

  it('revokes a character’s open invitations even without a player, and is idempotent', async () => {
    const t = await table();
    const open = await t.invite(t.dm, SEREN);
    const revoke = () =>
      t.send('POST', `/campaigns/ravenford/members/${SEREN}/revoke`, { cookie: t.dm });
    expect((await revoke()).json()).toEqual({
      released: false,
      sessionsRevoked: 0,
      invitationsRevoked: 1,
    });
    expect((await t.redeem(open.token)).statusCode).toBe(401);
    expect((await revoke()).json()).toEqual({
      released: false,
      sessionsRevoked: 0,
      invitationsRevoked: 0,
    });
  });

  it('answers the World Engine’s refusal to the DM, the player already signed out', async () => {
    const t = await table();
    const { token } = await t.invite(t.dm, SEREN);
    const player = await t.signInWith(token);
    // A concurrent release wins the race between the DM's read and the command.
    const execute = t.engine.execute.bind(t.engine);
    t.engine.execute = async (submission) => {
      const { command } = submission as { command?: { type?: string } };
      if (command?.type === 'ReleaseCharacter') {
        await execute({ ...(submission as object), commandId: 'release-first' });
      }
      return execute(submission);
    };
    const response = await t.send(
      'POST',
      `/campaigns/ravenford/members/${SEREN}/revoke`,
      { cookie: t.dm },
      {},
    );
    expect(response.statusCode).toBe(422);
    expect(response.json<CommandResult>()).toMatchObject({ status: 'rejected', code: 'NO_EFFECT' });
    expect((await t.send('GET', '/auth/session', { cookie: player })).statusCode).toBe(401);
  });
});

describe('the DM’s alone, in the ADR 0009 order', () => {
  it('answers 401, then 400, then the 404 of a missing campaign for anyone else', async () => {
    const t = await table();
    const { token } = await t.invite(t.dm, SEREN);
    const player = await t.signInWith(token);
    const routes: [method: 'GET' | 'POST', path: string, body?: unknown][] = [
      ['GET', 'invitations'],
      ['POST', 'invitations', { characterId: SEREN }],
      ['POST', 'invitations/6f1c2a5e-1b8f-4c1e-9e55-5d9f7f2b3a10/revoke', {}],
      ['POST', `members/${SEREN}/revoke`, {}],
    ];
    for (const [method, path, body] of routes) {
      const url = `/campaigns/ravenford/${path}`;
      expect((await t.send(method, url, {}, body)).statusCode).toBe(401);
      const asPlayer = await t.send(method, url, { cookie: player }, body);
      const nowhere = await t.send(method, `/campaigns/nowhere/${path}`, { cookie: t.dm }, body);
      expect(withoutRequestId(asPlayer)).toEqual(NOT_FOUND);
      expect(withoutRequestId(nowhere)).toEqual(NOT_FOUND);
    }
    // Input is checked before membership: a player's malformed request is a 400.
    for (const [method, path, body] of [
      ['POST', 'invitations', { characterId: 'Not An Id' }],
      ['POST', 'invitations', { characterId: SEREN, expiresHours: 169 }],
      ['POST', 'invitations', { characterId: SEREN, expiresHours: 0 }],
      ['POST', 'invitations', { characterId: SEREN, campaignId: 'ravenford' }],
      ['POST', 'invitations/not-a-uuid/revoke', {}],
      ['POST', `members/${SEREN}/revoke`, { reason: 'x' }],
      ['GET', 'invitations?all=1', undefined],
    ] as const) {
      const answer = await t.send(method, `/campaigns/ravenford/${path}`, { cookie: player }, body);
      expect(answer.statusCode, path).toBe(400);
    }
  });

  it('offers only a character’s empty seat', async () => {
    const t = await table();
    const invite = (characterId: string) =>
      t.send('POST', '/campaigns/ravenford/invitations', { cookie: t.dm }, { characterId });
    expect(withoutRequestId(await invite('mira-vale'))).toEqual(NOT_FOUND);
    expect(withoutRequestId(await invite('nobody'))).toEqual(NOT_FOUND);
    expect((await invite('elowen-starwhisper')).statusCode).toBe(409);
    const response = await invite(SEREN);
    expect(response.statusCode).toBe(201);
  });

  it('keeps the generic command route from releasing anyone', async () => {
    const t = await table();
    const response = await t.send(
      'POST',
      '/campaigns/ravenford/commands',
      { cookie: t.dm },
      { commandId: 'free-elowen', command: { type: 'ReleaseCharacter', characterId: SEREN } },
    );
    expect(response.statusCode).toBe(400);
  });
});
