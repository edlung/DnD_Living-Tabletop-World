import type { SessionResponse } from '@ltw/contracts';
import type { WorldEngine } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ALL_SECRET_MARKERS,
  TOKENS,
  get,
  ravenfordApp,
  seededEngine,
  withoutRequestId,
} from '../testing/ravenford-app.ts';

let app: FastifyInstance;
let engine: WorldEngine;
const URL = '/campaigns/ravenford/session';

beforeAll(async () => {
  engine = await seededEngine();
  app = await ravenfordApp(engine);
});
afterAll(async () => {
  await app.close();
});

describe('authenticated campaign session', () => {
  it('derives player identity and available perspectives from the current assignment', async () => {
    const response = await get(app, URL, TOKENS.player);
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['vary']).toBe('Authorization');
    const body = response.json<SessionResponse>();
    expect(body).toMatchObject({
      actorId: 'player-elowen',
      role: 'PLAYER',
      character: { entityId: 'elowen-starwhisper', kind: 'character', name: 'Elowen Starwhisper' },
      campaign: { campaignId: 'ravenford' },
    });
    expect(body.perspectives.map(({ value }) => value)).toEqual([
      'PLAYER',
      'CHARACTER:elowen-starwhisper',
      'PARTY',
      'PUBLIC',
    ]);
    expect(response.body).not.toContain(TOKENS.dm);
    expect(response.body).not.toContain('dm-ravenford');
    expect(ALL_SECRET_MARKERS.filter((marker) => response.body.includes(marker))).toEqual([]);
  });

  it('offers only authorized DM and character preview choices, without issuing credentials', async () => {
    const response = await get(app, URL, TOKENS.dm);
    const body = response.json<SessionResponse>();
    expect(body).toMatchObject({ actorId: 'dm-ravenford', role: 'DM', character: null });
    expect(body.perspectives.map(({ value }) => value)).toEqual([
      'DM',
      'PARTY',
      'PUBLIC',
      'CHARACTER:brann-ironvale',
      'CHARACTER:elowen-starwhisper',
      'CHARACTER:maren-ashby',
      'CHARACTER:tamsin-quickfoot',
    ]);
    expect(response.body).not.toContain(TOKENS.player);
    expect(response.body).not.toContain('player-elowen');
  });

  it('rejects forged inputs and hides campaign existence from outsiders', async () => {
    expect((await get(app, `${URL}?role=DM`)).statusCode).toBe(401);
    for (const suffix of ['?role=DM', '?actorId=dm-ravenford', '?perspective=DM', '?a=1&a=2']) {
      expect((await get(app, URL + suffix, TOKENS.player)).statusCode).toBe(400);
    }
    expect((await get(app, '/campaigns/Bad%20Id/session', TOKENS.player)).statusCode).toBe(400);
    const outsider = await get(app, URL, TOKENS.outsider);
    const absent = await get(app, '/campaigns/missing/session', TOKENS.outsider);
    expect(outsider.statusCode).toBe(404);
    expect(withoutRequestId(outsider)).toEqual(withoutRequestId(absent));
  });

  it('recomputes membership after assignment and undo instead of caching a granted role', async () => {
    const submit = (commandId: string, command: Record<string, unknown>) =>
      engine.execute({
        campaignId: 'ravenford',
        commandId,
        actor: { kind: 'user', actorId: 'dm-ravenford' },
        command,
      });
    expect(
      (
        await submit('session-create-guest', {
          type: 'CreateEntity',
          entityId: 'guest-character',
          kind: 'character',
          name: 'Guest',
          existsSince: null,
        })
      ).status,
    ).toBe('accepted');
    expect(
      (
        await submit('session-assign-guest', {
          type: 'AssignCharacter',
          characterId: 'guest-character',
          playerActorId: 'outsider',
        })
      ).status,
    ).toBe('accepted');
    const granted = await get(app, URL, TOKENS.outsider);
    expect(granted.statusCode).toBe(200);
    expect(granted.json<SessionResponse>().character?.entityId).toBe('guest-character');
    expect(
      (
        await submit('session-undo-guest', {
          type: 'UndoCommand',
          targetCommandId: 'session-assign-guest',
        })
      ).status,
    ).toBe('accepted');
    expect((await get(app, URL, TOKENS.outsider)).statusCode).toBe(404);
  });
});
