import type { CommandResult, LobbyResponse } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TOKENS, get, post, ravenfordApp } from '../testing/ravenford-app.ts';

/**
 * A session's lobby and the table around it (docs/adr/0043-dm-screen.md §6): a player says
 * "ready" for their own character, the DM marks a player absent and pauses the table, and while it
 * is paused a player's command waits; the DM's does not.
 */
let app: FastifyInstance;
const BASE = '/campaigns/ravenford';
const ELOWEN = 'elowen-starwhisper';

beforeEach(async () => {
  app = await ravenfordApp();
});

afterEach(async () => {
  await app.close();
});

const lobby = async (perspective: string, token: string) =>
  (await get(app, `${BASE}/lobby?perspective=${perspective}`, token)).json<LobbyResponse>();

describe('the lobby', () => {
  it('shows who is ready and absent, in each perspective’s own characters', async () => {
    const start = await lobby('DM', TOKENS.dm);
    expect(start).toMatchObject({ mode: 'table', paused: false });
    expect(start.characters.find((entry) => entry.character.entityId === ELOWEN)).toMatchObject({
      present: false,
      ready: false,
      absent: false,
    });
    const ready = await post(
      app,
      `${BASE}/lobby/ready?perspective=PLAYER`,
      { characterId: ELOWEN, ready: true },
      TOKENS.player,
    );
    expect(ready.statusCode).toBe(204);
    // Not someone else's character, and nothing else of the table.
    expect(
      (
        await post(
          app,
          `${BASE}/lobby/ready?perspective=PLAYER`,
          { characterId: 'brann-ironvale', ready: true },
          TOKENS.player,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (await post(app, `${BASE}/lobby?perspective=PLAYER`, { paused: true }, TOKENS.player))
        .statusCode,
    ).toBe(403);
    const absent = await post(
      app,
      `${BASE}/lobby?perspective=DM`,
      { mode: 'online', absent: { characterId: 'brann-ironvale', absent: true } },
      TOKENS.dm,
    );
    expect(absent.statusCode).toBe(204);
    const seen = await lobby('DM', TOKENS.dm);
    expect(seen.mode).toBe('online');
    const of = (id: string) => seen.characters.find((entry) => entry.character.entityId === id);
    expect(of(ELOWEN)?.ready).toBe(true);
    expect(of('brann-ironvale')?.absent).toBe(true);
    // A player reads the lobby of the characters their perspective knows.
    const theirs = await lobby('PLAYER', TOKENS.player);
    expect(theirs.characters.map((entry) => entry.character.entityId)).toContain(ELOWEN);
  });

  it('holds a player’s command while the DM has paused the table', async () => {
    const pause = (paused: boolean) =>
      post(app, `${BASE}/lobby?perspective=DM`, { paused }, TOKENS.dm);
    expect((await pause(true)).statusCode).toBe(204);
    const go = (token: string, commandId: string, locationId = 'golden-stag-inn') =>
      post(
        app,
        `${BASE}/commands`,
        { commandId, command: { type: 'EnterLocation', characterId: ELOWEN, locationId } },
        token,
      );
    const held = await go(TOKENS.player, 'walk-1');
    expect(held.statusCode).toBe(409);
    expect(held.json<CommandResult>()).toMatchObject({
      status: 'rejected',
      code: 'SESSION_PAUSED',
    });
    // The DM still acts while the table waits.
    expect((await go(TOKENS.dm, 'walk-dm')).statusCode).toBe(200);
    expect((await lobby('PLAYER', TOKENS.player)).paused).toBe(true);
    expect((await pause(false)).statusCode).toBe(204);
    expect((await go(TOKENS.player, 'walk-2', 'market-square')).statusCode).toBe(200);
  });

  it('keeps what the table hears: the DM chooses, everyone reads it (ADR 0059 §1)', async () => {
    const choose = (ambience: string, perspective = 'DM', token: string = TOKENS.dm) =>
      post(app, `${BASE}/lobby?perspective=${perspective}`, { ambience }, token);
    // By the scene, until the DM chooses.
    expect((await lobby('PLAYER', TOKENS.player)).sound).toEqual({
      ambience: 'scene',
      music: null,
    });
    expect((await choose('rain')).statusCode).toBe(204);
    expect((await lobby('PLAYER', TOKENS.player)).sound).toEqual({ ambience: 'rain', music: null });
    // A change of something else keeps it.
    expect(
      (await post(app, `${BASE}/lobby?perspective=DM`, { paused: true }, TOKENS.dm)).statusCode,
    ).toBe(204);
    expect((await lobby('DM', TOKENS.dm)).sound).toEqual({ ambience: 'rain', music: null });
    // A player does not choose it, and no soundscape the table lacks is taken.
    expect((await choose('fire', 'PLAYER', TOKENS.player)).statusCode).toBe(403);
    expect((await choose('thunder')).statusCode).toBe(400);
    expect((await choose('none')).statusCode).toBe(204);
    expect((await lobby('DM', TOKENS.dm)).sound).toEqual({ ambience: 'none', music: null });
  });
});
