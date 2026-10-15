import { request, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';

import { describe, expect, it } from 'vitest';

import { liveRavenford } from '../testing/live.ts';
import { TOKENS } from '../testing/ravenford-app.ts';

/**
 * The live stream over a real local connection (docs/adr/0033-live-session.md §1): frames
 * arrive as they are written, and a client that goes away is forgotten without disturbing
 * later cycles or heartbeats.
 */
const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;

async function eventually(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('condition not met');
}

describe('the live stream over a socket', () => {
  it('streams each frame as written and forgets a client that disconnects', async () => {
    const live = await liveRavenford();
    await live.app.listen({ host: '127.0.0.1', port: 0 });
    const { port } = live.app.server.address() as AddressInfo;
    const client = request({
      host: '127.0.0.1',
      port,
      path: '/campaigns/ravenford/live?perspective=PLAYER',
      headers: { authorization: `Bearer ${TOKENS.player}` },
    });
    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      client.on('response', resolve);
      client.on('error', reject);
      client.end();
    });
    let text = '';
    response.on('data', (chunk: Buffer) => {
      text += chunk.toString('utf8');
    });
    response.on('error', () => undefined);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/event-stream; charset=utf-8');
    expect(response.headers['cache-control']).toBe('no-store');
    await eventually(() => text.includes('event: ready'));

    const result = await live.engine.execute({
      commandId: 'live-socket.party',
      campaignId: 'ravenford',
      actor: DM,
      command: {
        type: 'AddKnowledge',
        scope: { kind: 'PARTY' },
        knowledgeType: 'RUMOR',
        statement: 'A bell rang at the ford.',
        subjects: ['old-trade-road'],
        knownSince: null,
      },
    });
    expect(result.status).toBe('accepted');
    await live.hub.cycle();
    await eventually(() => text.includes('event: changed\ndata: {"seq":1}\n\n'));

    client.destroy();
    await eventually(() => live.hub.size === 0);
    // Nobody is left to write to, and nothing fails.
    await live.hub.cycle();
    live.timers.advance(15_000);
    await live.app.close();
    expect(text).toBe('event: ready\ndata: {}\n\nevent: changed\ndata: {"seq":1}\n\n');
  });
});
