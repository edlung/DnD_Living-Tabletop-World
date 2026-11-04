import { randomUUID } from 'node:crypto';

import type {
  AddedFromBestiaryResponse,
  BestiaryEntryResponse,
  BestiaryResponse,
  EncounterResponse,
} from '@ltw/contracts';
import type { WorldEngine } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { get, post, ravenfordApp, seededEngine, TOKENS } from '../testing/ravenford-app.ts';

/**
 * The DM's bestiary (docs/adr/0053-monsters-as-data.md §3): the SRD's stat blocks listed for the
 * DM alone; one added becomes a creature of the campaign, and joins a running fight on its square.
 */
const BASE = '/campaigns/ravenford';
const LIST = `${BASE}/bestiary`;
const PARTY = ['brann-ironvale', 'elowen-starwhisper', 'maren-ashby', 'tamsin-quickfoot'];

async function partyOnTheRoad(engine: WorldEngine) {
  for (const entityId of PARTY) {
    const result = await engine.execute({
      commandId: `test.travel.${entityId}`,
      campaignId: 'ravenford',
      actor: { actorId: 'dm-ravenford', kind: 'user' },
      command: { type: 'PlaceEntity', entityId, locationId: 'old-trade-road' },
    });
    expect(result.status).toBe('accepted');
  }
}

describe('the bestiary', () => {
  it('lists the SRD’s 330 stat blocks and one’s whole text, for the DM alone', async () => {
    const app = await ravenfordApp();
    expect((await get(app, LIST)).statusCode).toBe(401);
    expect((await get(app, LIST, TOKENS.player)).statusCode).toBe(403);
    const listed = (await get(app, LIST, TOKENS.dm)).json<BestiaryResponse>();
    expect(listed.monsters).toHaveLength(330);
    expect(listed.monsters.find((entry) => entry.monsterId === 'wolf')).toEqual({
      monsterId: 'wolf',
      name: 'Wolf',
      size: 'Medium',
      type: 'Beast',
      creatureType: 'beast',
      challenge: '1/4',
      xp: 50,
      armorClass: 12,
      hitPoints: 11,
    });
    const wolf = (await get(app, `${LIST}/wolf`, TOKENS.dm)).json<BestiaryEntryResponse>();
    expect(wolf.monster.actions.map((action) => action.name)).toEqual(['Bite']);
    expect((await get(app, `${LIST}/no-such-beast`, TOKENS.dm)).statusCode).toBe(404);
    expect((await get(app, `${LIST}/Not A Slug`, TOKENS.dm)).statusCode).toBe(400);
  });

  it('adds a wolf to the campaign, and another to the running fight, once per request', async () => {
    const engine = await seededEngine();
    const app = await ravenfordApp(engine);
    await partyOnTheRoad(engine);
    const before = (await engine.load('ravenford'))?.state.entities.size ?? 0;
    const added = await post(app, `${LIST}/wolf/add`, { requestId: randomUUID() }, TOKENS.dm);
    const wolf = added.json<AddedFromBestiaryResponse>();
    expect(wolf).toMatchObject({ status: 'added', fighting: false });
    expect(wolf.entityId).toMatch(/^creature-[0-9a-f]{8}$/);
    const state = (await engine.load('ravenford'))?.state;
    expect(state?.entities.size).toBe(before + 1);
    expect(state?.statBlocks.get(wolf.entityId)).toMatchObject({ armorClass: 12, speedFt: 40 });
    expect(
      (await post(app, `${LIST}/wolf/add`, { requestId: randomUUID() }, TOKENS.player)).statusCode,
    ).toBe(403);

    // In a fight: the prepared ambush, then a wolf on the board, once however often it is asked.
    const started = await post(
      app,
      `${BASE}/encounters/prepared/road-ambush/start`,
      { requestId: randomUUID() },
      TOKENS.dm,
    );
    expect(started.statusCode).toBe(200);
    const requestId = randomUUID();
    const request = { requestId, name: 'Hungry wolf', square: { x: 0, y: 0 }, side: 'hostile' };
    const joined = (
      await post(app, `${LIST}/wolf/add`, request, TOKENS.dm)
    ).json<AddedFromBestiaryResponse>();
    expect(joined.fighting).toBe(true);
    expect((await post(app, `${LIST}/wolf/add`, request, TOKENS.dm)).json()).toEqual(joined);
    const encounter = (
      await get(app, `${BASE}/encounter?perspective=DM`, TOKENS.dm)
    ).json<EncounterResponse>().encounter;
    const wolves = encounter?.combatants.filter((one) => one.entity.entityId === joined.entityId);
    expect(wolves).toHaveLength(1);

    // A square already taken: refused before anything is written, the creature not made.
    const entities = (await engine.load('ravenford'))?.state.entities.size;
    const taken = await post(
      app,
      `${LIST}/wolf/add`,
      { requestId: randomUUID(), square: { x: 0, y: 0 }, side: 'hostile' },
      TOKENS.dm,
    );
    expect(taken.statusCode).toBe(422);
    expect(taken.json()).toMatchObject({
      status: 'rejected',
      code: 'INVALID_ENCOUNTER',
      message: 'Two combatants cannot share a square',
      details: { square: 'taken' },
    });
    expect((await engine.load('ravenford'))?.state.entities.size).toBe(entities);
  });
});
