import type { HandoutView, HandoutsResponse } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TOKENS, get, post, ravenfordApp } from '../testing/ravenford-app.ts';

/**
 * Handouts (docs/adr/0044-online-play.md §5): the DM gives them; a character's perspective reads
 * the party's and its own, the party's view only the party's; a picture is of something its
 * recipient knows. Players give none.
 */
let app: FastifyInstance;
const BASE = '/campaigns/ravenford';
const ELOWEN = 'elowen-starwhisper';
const BRANN = 'brann-ironvale';

beforeEach(async () => {
  app = await ravenfordApp();
});

afterEach(async () => {
  await app.close();
});

const give = (body: Record<string, unknown>, token = TOKENS.dm, perspective = 'DM') =>
  post(app, `${BASE}/handouts?perspective=${perspective}`, body, token);
const read = async (perspective: string, token: string) =>
  (await get(app, `${BASE}/handouts?perspective=${perspective}`, token)).json<HandoutsResponse>()
    .handouts;
const titles = (handouts: readonly HandoutView[]) => handouts.map((handout) => handout.title);

describe('handouts', () => {
  it('reaches the party, or one player, and nobody else', async () => {
    expect(
      (await give({ title: 'The map of the road', text: 'North, past the mill.' })).statusCode,
    ).toBe(201);
    expect(
      (await give({ title: 'A letter for Elowen', text: 'Meet me.', recipientId: ELOWEN }))
        .statusCode,
    ).toBe(201);
    expect(
      (await give({ title: 'A note for Brann', text: 'Not her.', recipientId: BRANN })).statusCode,
    ).toBe(201);
    expect(titles(await read('DM', TOKENS.dm))).toEqual([
      'The map of the road',
      'A letter for Elowen',
      'A note for Brann',
    ]);
    const elowen = await read('PLAYER', TOKENS.player);
    expect(titles(elowen)).toEqual(['The map of the road', 'A letter for Elowen']);
    expect(elowen[1]?.to).toEqual({ entityId: ELOWEN, name: 'Elowen Starwhisper' });
    expect(elowen[0]?.to).toBe('party');
    expect(titles(await read('PARTY', TOKENS.player))).toEqual(['The map of the road']);
    expect(await read('PUBLIC', TOKENS.player)).toEqual([]);
  });

  it('shows a picture only of something its recipient knows', async () => {
    // The party knows Mira Vale; nobody but the DM knows the abandoned caravan site.
    const known = await give({ title: 'Mira', entityId: 'mira-vale', recipientId: ELOWEN });
    expect(known.statusCode).toBe(201);
    expect(known.json<{ handout: HandoutView }>().handout.picture).toEqual({
      entityId: 'mira-vale',
      name: 'Mira Vale',
    });
    expect((await give({ title: 'A secret', entityId: 'location-f3b82c8b' })).statusCode).toBe(422);
    expect((await give({ title: 'No one', entityId: 'nobody-at-all' })).statusCode).toBe(422);
    // Neither a text nor a picture: nothing to hand out.
    expect((await give({ title: 'Empty' })).statusCode).toBe(400);
    expect(
      (await give({ title: 'To a place', text: 'x', recipientId: 'market-square' })).statusCode,
    ).toBe(422);
  });

  it('is the DM’s to give', async () => {
    expect((await give({ title: 'Mine', text: 'x' }, TOKENS.player, 'PLAYER')).statusCode).toBe(
      403,
    );
  });
});
