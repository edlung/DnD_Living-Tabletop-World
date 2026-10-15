import type { PresenceResponse } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import hiddenCharacter from '../../../../tests/e2e/fixtures/hidden-character.json' with { type: 'json' };
import { delivered, liveRavenford, readyLive, type LiveRavenford } from '../testing/live.ts';
import { get, TOKENS } from '../testing/ravenford-app.ts';

/**
 * Presence (docs/adr/0033-live-session.md §5): for the characters of the perspective's own
 * entity view, whether their players hold a live subscription (10 s grace, tabs counted once),
 * and whether the DM does. Never an actor ID, never a character the perspective cannot see,
 * and a hidden player's arrival changes nothing another perspective may read.
 */
const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;
const ACTOR_IDS = ['dm-ravenford', 'player-elowen', 'outsider'];

const presence = async (live: LiveRavenford, perspective: string, token: string) => {
  const response = await get(
    live.app,
    `/campaigns/ravenford/presence?perspective=${encodeURIComponent(perspective)}`,
    token,
  );
  expect(response.statusCode).toBe(200);
  for (const actorId of ACTOR_IDS) expect(response.body).not.toContain(actorId);
  return response.json<PresenceResponse>();
};

const present = (body: PresenceResponse) =>
  Object.fromEntries(body.characters.map((entry) => [entry.character.name, entry.present]));

const live = (perspective: string) =>
  `/campaigns/ravenford/live?perspective=${encodeURIComponent(perspective)}`;

describe('presence', () => {
  it('follows the check order of ADR 0009', async () => {
    const app = (await liveRavenford()).app;
    const path = (query: string, campaign = 'ravenford') =>
      `/campaigns/${campaign}/presence?${query}`;
    expect((await get(app, path('perspective=PLAYER'))).statusCode).toBe(401);
    expect((await get(app, path('perspective=PLAYER&x=1'), TOKENS.player)).statusCode).toBe(400);
    expect(
      (await get(app, path('perspective=PLAYER', 'elsewhere'), TOKENS.player)).statusCode,
    ).toBe(404);
    expect((await get(app, path('perspective=PUBLIC'), TOKENS.outsider)).statusCode).toBe(404);
    expect((await get(app, path('perspective=DM'), TOKENS.player)).statusCode).toBe(403);
  });

  it('shows who is at the table, counts tabs once, and keeps a 10 s grace', async () => {
    const world = await liveRavenford();
    const own = () => presence(world, 'PLAYER', TOKENS.player);
    expect(await own()).toEqual({
      perspective: 'CHARACTER:elowen-starwhisper',
      dmConnected: false,
      characters: [
        {
          character: {
            entityId: 'elowen-starwhisper',
            kind: 'character',
            name: 'Elowen Starwhisper',
          },
          present: false,
        },
      ],
    });
    const tabs = [
      await readyLive(world.app, live('PLAYER'), TOKENS.player),
      await readyLive(world.app, live('PARTY'), TOKENS.player),
    ];
    const dm = await readyLive(world.app, live('DM'), TOKENS.dm);
    expect(await own()).toMatchObject({ dmConnected: true });
    expect(present(await own())).toEqual({ 'Elowen Starwhisper': true });
    tabs[0]?.disconnect();
    await delivered();
    expect(present(await own())).toEqual({ 'Elowen Starwhisper': true });
    tabs[1]?.disconnect();
    dm.disconnect();
    await delivered();
    world.timers.advance(9_999);
    expect(await own()).toMatchObject({ dmConnected: true });
    expect(present(await own())).toEqual({ 'Elowen Starwhisper': true });
    world.timers.advance(1);
    expect(await own()).toMatchObject({ dmConnected: false });
    expect(present(await own())).toEqual({ 'Elowen Starwhisper': false });
    // A reconnect within the grace never shows an absence.
    const back = await readyLive(world.app, live('PLAYER'), TOKENS.player);
    back.disconnect();
    await delivered();
    world.timers.advance(5_000);
    await readyLive(world.app, live('PLAYER'), TOKENS.player);
    world.timers.advance(20_000);
    expect(present(await own())).toEqual({ 'Elowen Starwhisper': true });
  });

  it('never lists, or signals, a character the perspective cannot see', async () => {
    const world = await liveRavenford({ limits: { perActor: 10 } });
    for (const [index, command] of [
      hiddenCharacter,
      // The sentinel gets a player of its own: the outsider is now a member.
      { type: 'AssignCharacter', characterId: hiddenCharacter.entityId, playerActorId: 'outsider' },
    ].entries()) {
      const result = await world.engine.execute({
        commandId: `presence.${String(index)}`,
        campaignId: 'ravenford',
        actor: DM,
        command,
      });
      expect(result.status).toBe('accepted');
    }
    const observers = await Promise.all([
      readyLive(world.app, live('PUBLIC'), TOKENS.player),
      readyLive(world.app, live('NPC:mira-vale'), TOKENS.dm),
      readyLive(world.app, live('NPC:captain-thorne'), TOKENS.dm),
    ]);
    await world.hub.cycle();
    await delivered();
    const signals = () =>
      observers.map((stream) => stream.messages().filter((m) => m.type === 'changed').length);
    const before = signals();
    const viewsBefore = await Promise.all([
      presence(world, 'PUBLIC', TOKENS.player),
      presence(world, 'NPC:mira-vale', TOKENS.dm),
      presence(world, 'NPC:captain-thorne', TOKENS.dm),
    ]);

    const hiddenPlayer = await readyLive(world.app, live('PLAYER'), TOKENS.outsider);
    await world.hub.cycle();
    await delivered();
    expect(signals()).toEqual(before);
    const viewsAfter = await Promise.all([
      presence(world, 'PUBLIC', TOKENS.player),
      presence(world, 'NPC:mira-vale', TOKENS.dm),
      presence(world, 'NPC:captain-thorne', TOKENS.dm),
    ]);
    expect(viewsAfter).toEqual(viewsBefore);
    for (const view of viewsAfter) {
      expect(JSON.stringify(view)).not.toContain(hiddenCharacter.entityId);
      expect(JSON.stringify(view)).not.toContain(hiddenCharacter.name);
    }
    // The DM, and the party the sentinel now belongs to, see it at the table.
    expect(present(await presence(world, 'DM', TOKENS.dm))).toMatchObject({
      [hiddenCharacter.name]: true,
    });
    expect(present(await presence(world, 'PARTY', TOKENS.player))).toMatchObject({
      [hiddenCharacter.name]: true,
    });

    hiddenPlayer.disconnect();
    await delivered();
    world.timers.advance(10_000);
    await world.hub.cycle();
    await delivered();
    expect(signals()).toEqual(before);
  });
});
