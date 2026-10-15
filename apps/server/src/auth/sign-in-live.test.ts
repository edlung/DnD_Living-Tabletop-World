import { describe, expect, it } from 'vitest';

import { openLive, type LiveStream } from '../testing/live.ts';
import { ORIGIN, SEREN, signInTable, type SignInTable } from '../testing/sign-in.ts';
import { SESSION_MS } from './sign-in.ts';

/**
 * The live stream with session cookies (docs/adr/0036-production-sign-in.md §3;
 * docs/adr/0033-live-session.md §2): the fingerprint's injected views carry the subscriber's
 * cookie, so sign-out, the DM's revocation and expiry close the stream within one cycle.
 */
const PLAYER_LIVE = '/campaigns/ravenford/live?perspective=PLAYER';
const DM_LIVE = '/campaigns/ravenford/live?perspective=DM';

async function seated(): Promise<SignInTable & { dm: string; player: string }> {
  const table = await signInTable();
  const dm = await table.signInWith(await table.dmInvitation());
  const { token } = await table.invite(dm, SEREN);
  return { ...table, dm, player: await table.signInWith(token) };
}

async function ready(table: SignInTable, url: string, cookie: string): Promise<LiveStream> {
  const stream = await openLive(table.app, url, undefined, { cookie, origin: ORIGIN });
  expect(stream.status).toBe(200);
  await stream.until(() => stream.messages().some((message) => message.type === 'ready'));
  return stream;
}

async function closedWith(table: SignInTable, stream: LiveStream, reason: string) {
  // One cycle, and the stream has ended with its fixed reason.
  await table.hub.cycle();
  await stream.until(() => stream.ended());
  expect(stream.messages()).toEqual([{ type: 'ready' }, { type: 'closed', reason }]);
}

describe('a live stream on a session cookie', () => {
  it('is fingerprinted with the cookie alone, and never shows a credential', async () => {
    const table = await seated();
    const stream = await ready(table, PLAYER_LIVE, table.player);
    await table.hub.cycle();
    expect(stream.ended()).toBe(false);
    const token = table.player.slice('ltw_session='.length);
    expect(stream.frames().join('')).not.toContain(token);
    expect(JSON.stringify(stream.headers)).not.toContain(token);
    stream.disconnect();
  });

  it('closes within one cycle of signing out', async () => {
    const table = await seated();
    const stream = await ready(table, PLAYER_LIVE, table.player);
    expect((await table.send('POST', '/auth/sign-out', { cookie: table.player })).statusCode).toBe(
      204,
    );
    await closedWith(table, stream, 'unauthenticated');
    expect(table.hub.size).toBe(0);
  });

  it('closes within one cycle of the DM revoking the member, while the DM’s stays', async () => {
    const table = await seated();
    const player = await ready(table, PLAYER_LIVE, table.player);
    const dm = await ready(table, DM_LIVE, table.dm);
    const revoked = await table.send(
      'POST',
      `/campaigns/ravenford/members/${SEREN}/revoke`,
      { cookie: table.dm },
      {},
    );
    expect(revoked.statusCode).toBe(200);
    await closedWith(table, player, 'unauthenticated');
    // The DM saw the seat change.
    await dm.until(() => dm.messages().some((message) => message.type === 'changed'));
    expect(dm.ended()).toBe(false);
    dm.disconnect();
  });

  it('closes within one cycle of the session expiring', async () => {
    const table = await seated();
    const stream = await ready(table, PLAYER_LIVE, table.player);
    table.clock.advance(SESSION_MS);
    await closedWith(table, stream, 'unauthenticated');
  });

  it('closes as gone when the seat is released behind a session that still stands', async () => {
    const table = await seated();
    const stream = await ready(table, PLAYER_LIVE, table.player);
    const released = await table.engine.execute({
      commandId: 'release-direct',
      campaignId: 'ravenford',
      actor: { actorId: 'dm-ravenford', kind: 'user' },
      command: { type: 'ReleaseCharacter', characterId: SEREN },
    });
    expect(released.status).toBe('accepted');
    await closedWith(table, stream, 'gone');
  });

  it('refuses to open for a revoked or foreign session, in the ADR 0009 order', async () => {
    const table = await seated();
    await table.send('POST', '/auth/sign-out', { cookie: table.player });
    const revoked = await openLive(table.app, PLAYER_LIVE, undefined, {
      cookie: table.player,
      origin: ORIGIN,
    });
    expect(revoked.status).toBe(401);
    const foreign = await openLive(
      table.app,
      '/campaigns/other-table/live?perspective=DM',
      undefined,
      {
        cookie: table.dm,
        origin: ORIGIN,
      },
    );
    expect(foreign.status).toBe(404);
    expect(table.hub.size).toBe(0);
  });
});
