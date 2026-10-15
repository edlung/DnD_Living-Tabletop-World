import { describe, expect, it } from 'vitest';

import { createLogger } from '../platform/logging/logger.ts';
import {
  delivered,
  flippableAuthenticator,
  liveRavenford,
  openLive,
  readyLive,
} from '../testing/live.ts';
import { TOKENS, withoutRequestId } from '../testing/ravenford-app.ts';

/**
 * `GET /campaigns/:campaignId/live` over HTTP (docs/adr/0033-live-session.md §1–3): the check
 * order of ADR 0009 before the stream opens, the stream's headers and fixed frames, the recheck
 * of every cycle through the views (401, 403, 404 close the stream), and its end on a client
 * disconnect and on server shutdown.
 */
const url = (query: string, campaign = 'ravenford') => `/campaigns/${campaign}/live?${query}`;

describe('opening the live stream', () => {
  it('answers the check order of ADR 0009 before any stream opens', async () => {
    const { app, hub } = await liveRavenford();
    const cases: readonly [string, string | undefined, number][] = [
      [url('perspective=PLAYER'), undefined, 401],
      [url('perspective=PLAYER'), 'not-a-persona-token', 401],
      [url('perspective=NOBODY'), TOKENS.player, 400],
      [url('perspective=PLAYER&perspective=PARTY'), TOKENS.player, 400],
      [url('perspective=PLAYER&since=12'), TOKENS.player, 400],
      [url('perspective=PLAYER&focus=Not%20An%20Id'), TOKENS.player, 400],
      [url('perspective=PLAYER&place=../dm'), TOKENS.player, 400],
      [url('perspective=PLAYER', 'Ravenford'), TOKENS.player, 400],
      [url('perspective=PLAYER', 'elsewhere'), TOKENS.player, 404],
      [url('perspective=PUBLIC'), TOKENS.outsider, 404],
      [url('perspective=DM'), TOKENS.player, 403],
      [url('perspective=NPC:mira-vale'), TOKENS.player, 403],
      [url('perspective=PLAYER'), TOKENS.dm, 403],
    ];
    for (const [path, token, status] of cases) {
      const stream = await openLive(app, path, token);
      expect(stream.status, path).toBe(status);
      expect(stream.headers['content-type']).toMatch(/^application\/json/);
      await stream.body();
    }
    // A nonexistent and a foreign campaign are the same 404; nothing was subscribed.
    const nowhere = await app.inject({
      method: 'GET',
      url: url('perspective=PUBLIC', 'elsewhere'),
      headers: { authorization: `Bearer ${TOKENS.player}` },
    });
    const foreign = await app.inject({
      method: 'GET',
      url: url('perspective=PUBLIC'),
      headers: { authorization: `Bearer ${TOKENS.outsider}` },
    });
    expect(withoutRequestId(nowhere)).toEqual(withoutRequestId(foreign));
    expect(hub.size).toBe(0);
  });

  it('opens a no-store event stream whose first message follows the baseline', async () => {
    const { app } = await liveRavenford();
    const stream = await openLive(app, url('perspective=PLAYER&focus=mira-vale'), TOKENS.player);
    expect(stream.status).toBe(200);
    expect(stream.headers).toMatchObject({
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      vary: 'Authorization',
      'x-content-type-options': 'nosniff',
    });
    expect(stream.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    await stream.until(() => stream.frames().length > 0);
    expect(stream.frames()).toEqual(['event: ready\ndata: {}\n\n']);
    expect(JSON.stringify(stream.headers)).not.toContain(TOKENS.player);
  });

  it('serves the views it compares from a silent twin that has no live route of its own', async () => {
    const lines: string[] = [];
    const logger = createLogger({
      service: 'live-test',
      level: 'debug',
      destination: { write: (line: string) => lines.push(line) },
    });
    const { app, hub } = await liveRavenford({ logger });
    const stream = await readyLive(app, url('perspective=PLAYER'), TOKENS.player);
    await hub.cycle();
    // One knowledge query is logged, the subscription's own; the twin's requests are silent.
    const queries = lines.filter((line) => line.includes('knowledge query'));
    expect(queries).toHaveLength(1);
    expect(lines.join('\n')).not.toContain(TOKENS.player);
    expect(stream.ended()).toBe(false);
    stream.disconnect();
  });
});

describe('the recheck of every cycle', () => {
  const personas = {
    [TOKENS.dm]: 'dm-ravenford',
    [TOKENS.player]: 'player-elowen',
    [TOKENS.outsider]: 'outsider',
  };

  it.each([
    ['unauthenticated', TOKENS.player, 'perspective=PLAYER', null],
    ['gone', TOKENS.player, 'perspective=PLAYER', 'outsider'],
    ['forbidden', TOKENS.dm, 'perspective=DM', 'player-elowen'],
    // The views still answer, but the credential now names someone else.
    ['unauthenticated', TOKENS.dm, 'perspective=PARTY', 'player-elowen'],
  ] as const)(
    'closes with %s when the credential changes mid-stream',
    async (reason, token, query, actor) => {
      const { authenticator, flip } = flippableAuthenticator(personas);
      const { app, hub } = await liveRavenford({ authenticator });
      const stream = await readyLive(app, url(query), token);
      await hub.cycle();
      flip(token, actor);
      await hub.cycle();
      await stream.until(() => stream.ended());
      expect(stream.messages()).toEqual([{ type: 'ready' }, { type: 'closed', reason }]);
      expect(hub.size).toBe(0);
    },
  );

  it('closes with gone when the campaign no longer answers', async () => {
    const live = await liveRavenford();
    const stream = await readyLive(live.app, url('perspective=PLAYER'), TOKENS.player);
    const load = live.engine.load.bind(live.engine);
    live.engine.load = (campaignId) =>
      campaignId === 'ravenford' ? Promise.resolve(null) : load(campaignId);
    await live.hub.cycle();
    await stream.until(() => stream.ended());
    expect(stream.messages()).toEqual([{ type: 'ready' }, { type: 'closed', reason: 'gone' }]);
  });

  it('closes with gone, and never signals, when a view fails', async () => {
    const live = await liveRavenford();
    const stream = await readyLive(live.app, url('perspective=PLAYER'), TOKENS.player);
    live.engine.load = () => Promise.reject(new Error('database unavailable'));
    await live.hub.cycle();
    await stream.until(() => stream.ended());
    expect(stream.messages()).toEqual([{ type: 'ready' }, { type: 'closed', reason: 'gone' }]);
  });
});

describe('the end of a stream', () => {
  it('releases a stream when its client disconnects', async () => {
    const { app, hub } = await liveRavenford();
    const first = await readyLive(app, url('perspective=PLAYER'), TOKENS.player);
    const second = await readyLive(app, url('perspective=PARTY'), TOKENS.player);
    expect(hub.size).toBe(2);
    first.disconnect();
    await delivered();
    expect(hub.size).toBe(1);
    second.disconnect();
    await delivered();
    expect(hub.size).toBe(0);
  });

  it('closes every stream with shutdown when the server closes', async () => {
    const { app, hub } = await liveRavenford();
    const streams = [
      await readyLive(app, url('perspective=PLAYER'), TOKENS.player),
      await readyLive(app, url('perspective=DM'), TOKENS.dm),
    ];
    await app.close();
    for (const stream of streams) {
      await stream.until(() => stream.ended());
      expect(stream.messages()).toEqual([
        { type: 'ready' },
        { type: 'closed', reason: 'shutdown' },
      ]);
    }
    expect(hub.size).toBe(0);
  });

  it('is overloaded beyond four streams of one actor in one campaign', async () => {
    const { app } = await liveRavenford();
    for (let tab = 0; tab < 4; tab += 1) {
      await readyLive(app, url('perspective=PLAYER'), TOKENS.player);
    }
    const fifth = await openLive(app, url('perspective=PLAYER'), TOKENS.player);
    expect(fifth.status).toBe(200);
    await fifth.until(() => fifth.ended());
    expect(fifth.messages()).toEqual([{ type: 'closed', reason: 'overloaded' }]);
    // The DM's own streams are counted separately.
    const dm = await readyLive(app, url('perspective=DM'), TOKENS.dm);
    expect(dm.ended()).toBe(false);
  });
});
