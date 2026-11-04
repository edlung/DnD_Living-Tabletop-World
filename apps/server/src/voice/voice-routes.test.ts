import { createHmac } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { delivered, openLive, type LiveStream } from '../testing/live.ts';
import { TOKENS, get, post, ravenfordApp } from '../testing/ravenford-app.ts';
import { relayCredentials } from './voice-routes.ts';

/**
 * The table's voice over HTTP (docs/adr/0060-voice.md): the room opens only while a session plays
 * online, only to the DM and players with a character; the server relays a signal to the one
 * speaker it names; the DM mutes and removes; leaving online play ends the room; a relay's
 * credentials are short-lived and the secret never leaves the server.
 */
let app: FastifyInstance;
const BASE = '/campaigns/ravenford';
const open: LiveStream[] = [];

beforeEach(async () => {
  app = await ravenfordApp();
});

afterEach(async () => {
  for (const stream of open.splice(0)) stream.disconnect();
  await app.close();
});

const stream = async (token: string) => {
  const opened = await openLive(app, `${BASE}/voice/stream`, token);
  open.push(opened);
  return opened;
};

/** The last `room` frame a stream received. */
const roomOf = (opened: LiveStream) =>
  opened
    .messages()
    .filter((message) => (message.type as string) === 'room')
    .at(-1) as unknown as
    { you: string; peers: { peerId: string; dm: boolean; muted: boolean }[] } | undefined;

/** The last room frame, once there is one. */
const roomIn = (opened: LiveStream) => {
  const room = roomOf(opened);
  if (!room) throw new Error('no room frame yet');
  return room;
};

/** Ravenford's first session is open in its seed: the DM takes the table online. */
async function playOnline() {
  const before = (await get(app, `${BASE}/lobby?perspective=DM`, TOKENS.dm)).json<{
    session: unknown;
  }>();
  expect(before.session).not.toBeNull();
  const online = await post(app, `${BASE}/lobby?perspective=DM`, { mode: 'online' }, TOKENS.dm);
  expect(online.statusCode).toBe(204);
}

describe('the table’s voice', () => {
  it('opens only while a session plays online, and only to the table', async () => {
    const early = await stream(TOKENS.player);
    expect(early.status).toBe(409);
    await playOnline();
    const outsider = await stream(TOKENS.outsider);
    expect(outsider.status).toBe(404);
    const player = await stream(TOKENS.player);
    expect(player.status).toBe(200);
    expect(player.headers['content-type']).toMatch(/^text\/event-stream/);
    await player.until(() => roomOf(player)?.peers.length === 1);
  });

  it('introduces two speakers to each other and relays a signal to the one it names', async () => {
    await playOnline();
    const dm = await stream(TOKENS.dm);
    const player = await stream(TOKENS.player);
    await dm.until(() => roomOf(dm)?.peers.length === 2);
    await player.until(() => roomOf(player)?.peers.length === 2);
    const { you: dmPeer } = roomIn(dm);
    const playerPeer = roomIn(player).you;
    expect(roomIn(dm).peers.find((peer) => peer.peerId === dmPeer)?.dm).toBe(true);
    const sent = await post(
      app,
      `${BASE}/voice/signal`,
      { to: playerPeer, kind: 'offer', sdp: 'v=0' },
      TOKENS.dm,
    );
    expect(sent.statusCode).toBe(204);
    await player.until(() =>
      player.messages().some((message) => (message.type as string) === 'signal'),
    );
    expect(player.messages().find((message) => (message.type as string) === 'signal')).toEqual({
      type: 'signal',
      kind: 'offer',
      sdp: 'v=0',
      from: dmPeer,
    });
    // Nobody outside the room is named.
    const astray = await post(
      app,
      `${BASE}/voice/signal`,
      { to: '3f1d6a2e-9c4b-4e1a-8f3d-2b7c9e5a1d40', kind: 'answer', sdp: 'v=0' },
      TOKENS.player,
    );
    expect(astray.statusCode).toBe(409);
  });

  it('takes the DM’s mute and removal, not a player’s, and ends with online play', async () => {
    await playOnline();
    const dm = await stream(TOKENS.dm);
    const player = await stream(TOKENS.player);
    await dm.until(() => roomOf(dm)?.peers.length === 2);
    await player.until(() => roomOf(player)?.peers.length === 2);
    const playerPeer = roomIn(player).you;
    expect(
      (await post(app, `${BASE}/voice/mute`, { peerId: playerPeer, muted: true }, TOKENS.player))
        .statusCode,
    ).toBe(403);
    expect(
      (await post(app, `${BASE}/voice/mute`, { peerId: playerPeer, muted: true }, TOKENS.dm))
        .statusCode,
    ).toBe(204);
    await dm.until(
      () => roomOf(dm)?.peers.find((peer) => peer.peerId === playerPeer)?.muted === true,
    );
    expect(
      (await post(app, `${BASE}/voice/remove`, { peerId: playerPeer }, TOKENS.dm)).statusCode,
    ).toBe(204);
    await player.until(() => player.ended());
    expect(player.messages().at(-1)).toEqual({ type: 'closed', reason: 'removed' });
    // Back at the table, the room ends.
    await post(app, `${BASE}/lobby?perspective=DM`, { mode: 'table' }, TOKENS.dm);
    await dm.until(() => dm.ended());
    expect(dm.messages().at(-1)).toEqual({ type: 'closed', reason: 'ended' });
    await delivered();
  });

  it('closes a speaker’s stream once they may no longer speak: the session ended', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      await playOnline();
      const player = await stream(TOKENS.player);
      await player.until(() => roomOf(player) !== undefined);
      const lobby = (await get(app, `${BASE}/lobby?perspective=DM`, TOKENS.dm)).json<{
        session: { sessionId: string };
      }>();
      const ended = await post(
        app,
        `${BASE}/commands?perspective=DM`,
        {
          commandId: 'voice-session-ends',
          command: { type: 'EndSession', sessionId: lobby.session.sessionId },
        },
        TOKENS.dm,
      );
      expect(ended.statusCode).toBe(200);
      // Still in the room until the next check of who may be.
      expect(player.ended()).toBe(false);
      vi.advanceTimersByTime(20_000);
      await player.until(() => player.ended());
      expect(player.messages().at(-1)).toEqual({ type: 'closed', reason: 'ended' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives a relay’s short-lived credentials while the room is open, none without a relay', async () => {
    // Not a proxy between sessions: before the table plays online there are none to give.
    expect((await get(app, `${BASE}/voice/ice`, TOKENS.player)).statusCode).toBe(409);
    await playOnline();
    const ice = await get(app, `${BASE}/voice/ice`, TOKENS.player);
    expect(ice.json()).toEqual({ iceServers: [] });
    const secret = 'a long shared relay secret';
    const now = Date.parse('2026-11-04T12:00:00.000Z');
    const server = relayCredentials(
      { urls: ['turn:relay.example:3478'], secret: { reveal: () => secret } },
      'ravenford',
      now,
    );
    const expiry = Math.floor(now / 1000) + 3600;
    expect(server).toEqual({
      urls: ['turn:relay.example:3478'],
      username: `${String(expiry)}:ravenford`,
      credential: createHmac('sha1', secret)
        .update(`${String(expiry)}:ravenford`)
        .digest('base64'),
    });
    expect(JSON.stringify(server)).not.toContain(secret);
  });
});
