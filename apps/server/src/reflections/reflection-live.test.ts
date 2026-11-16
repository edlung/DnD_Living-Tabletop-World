import { afterEach, describe, expect, it } from 'vitest';

import { delivered, liveRavenford, readyLive, type LiveStream } from '../testing/live.ts';
import { TOKENS, post } from '../testing/ravenford-app.ts';

/**
 * Stars and wishes and the live signal (docs/adr/0071-memory-and-ritual.md §2): a star signals
 * everyone at the table; a wish alone signals its author and the DM and nobody else. The
 * application and its fingerprint twin share one store, also in a composition without a database.
 */
const apps: { close(): Promise<unknown> }[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const changes = (stream: LiveStream) =>
  stream.messages().filter((message) => message.type === 'changed').length;
const live = (perspective: string) =>
  `/campaigns/ravenford/live?perspective=${encodeURIComponent(perspective)}`;

describe('stars and wishes and the live signal', () => {
  it('signal the table for a star, and only the DM for another’s wish', async () => {
    const world = await liveRavenford({ limits: { perActor: 8 } });
    apps.push(world.app);
    const ended = await post(
      world.app,
      '/campaigns/ravenford/commands',
      { commandId: 'end', command: { type: 'EndSession', sessionId: 'ravenford-s1' } },
      TOKENS.dm,
    );
    expect(ended.json()).toMatchObject({ status: 'accepted' });
    const dm = await readyLive(world.app, live('DM'), TOKENS.dm);
    const player = await readyLive(world.app, live('PLAYER'), TOKENS.player);
    const step = async () => {
      await world.hub.cycle();
      await delivered();
      return [changes(dm), changes(player)];
    };
    const [dmStart = 0, playerStart = 0] = await step();
    const write = (token: string, perspective: string, body: Record<string, unknown>) =>
      post(
        world.app,
        `/campaigns/ravenford/reflections?perspective=${perspective}`,
        { sessionId: 'ravenford-s1', ...body },
        token,
      );

    // The player's star: the DM's sheet and the player's own card follow it.
    const mine = { characterId: 'elowen-starwhisper', star: 'The chase!', wish: '' };
    expect((await write(TOKENS.player, 'PLAYER', mine)).statusCode).toBe(204);
    expect(await step()).toEqual([dmStart + 1, playerStart + 1]);

    // The DM writes another player's wish alone: nothing of it reaches this player, not a signal.
    const wish = { characterId: 'brann-ironvale', star: '', wish: 'More riddles, please.' };
    expect((await write(TOKENS.dm, 'DM', wish)).statusCode).toBe(204);
    expect(await step()).toEqual([dmStart + 2, playerStart + 1]);
  });
});
