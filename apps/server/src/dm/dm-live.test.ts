import { afterEach, describe, expect, it } from 'vitest';

import { delivered, liveRavenford, readyLive, type LiveStream } from '../testing/live.ts';
import { TOKENS, get, post } from '../testing/ravenford-app.ts';

/**
 * The DM history in the live session (docs/adr/0033-live-session.md §2, §7): it is in the DM
 * perspective's coverage, so the DM's screen follows it, while a reason the DM records changes
 * nothing anyone reads (it describes a command that does not exist yet) and signals nobody.
 */
const apps: { close(): Promise<unknown> }[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const changes = (stream: LiveStream) =>
  stream.messages().filter((message) => message.type === 'changed').length;
const live = (perspective: string) =>
  `/campaigns/ravenford/live?perspective=${encodeURIComponent(perspective)}`;

describe('the DM history and the live signal', () => {
  it('signals nobody for a recorded reason, and the DM and her player for its command', async () => {
    const world = await liveRavenford({ limits: { perActor: 8 } });
    apps.push(world.app);
    const dm = await readyLive(world.app, live('DM'), TOKENS.dm);
    const dmAsHer = await readyLive(world.app, live('CHARACTER:elowen-starwhisper'), TOKENS.dm);
    const player = await readyLive(world.app, live('PLAYER'), TOKENS.player);
    const party = await readyLive(world.app, live('PARTY'), TOKENS.player);
    const streams = [dm, dmAsHer, player, party];
    // Everyone takes in the others' arrival (presence) first.
    await world.hub.cycle();
    await delivered();
    const settled = streams.map(changes);

    const reason = {
      clientCommandId: 'walk',
      characterId: 'elowen-starwhisper',
      reason: 'asked',
      note: 'She asked me to take her to the gate.',
    };
    const recorded = await post(
      world.app,
      '/campaigns/ravenford/dm/substitutions',
      reason,
      TOKENS.dm,
    );
    expect(recorded.statusCode).toBe(201);
    for (let cycle = 0; cycle < 3; cycle += 1) await world.hub.cycle();
    await delivered();
    expect(streams.map(changes)).toEqual(settled);

    const walked = await post(
      world.app,
      '/campaigns/ravenford/commands',
      {
        commandId: 'walk',
        command: {
          type: 'EnterLocation',
          characterId: 'elowen-starwhisper',
          locationId: 'north-gate',
        },
      },
      TOKENS.dm,
    );
    expect(walked.json()).toMatchObject({ status: 'accepted' });
    await world.hub.cycle();
    await delivered();
    const after = streams.map(changes);
    // The DM's history and views, and what Elowen sees (for her player and for the DM as her).
    expect([after[0], after[1], after[2]]).toEqual([
      (settled[0] ?? 0) + 1,
      (settled[1] ?? 0) + 1,
      (settled[2] ?? 0) + 1,
    ]);
    expect((after[3] ?? 0) - (settled[3] ?? 0)).toBeLessThanOrEqual(1);
    const history = await get(
      world.app,
      '/campaigns/ravenford/dm/history?perspective=DM',
      TOKENS.dm,
    );
    expect(history.body).toContain(reason.note);
    // Nothing the player's streams carried, or could read, holds the DM's words.
    for (const stream of [player, party, dmAsHer]) {
      expect(stream.frames().join('')).not.toContain('gate');
    }
  });
});
