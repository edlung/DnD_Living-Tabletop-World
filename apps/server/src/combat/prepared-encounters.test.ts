import { randomUUID } from 'node:crypto';

import type { EncounterResponse, PreparedEncounterListResponse } from '@ltw/contracts';
import type { WorldEngine } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { get, post, ravenfordApp, seededEngine, TOKENS } from '../testing/ravenford-app.ts';

/**
 * Prepared encounters (Stage 605): the DM lists the adventure's ready fights and starts one in a
 * single step; the road ambush meets a party of four with eleven foes.
 */
const BASE = '/campaigns/ravenford';
const LIST = `${BASE}/encounters/prepared`;
const START = `${LIST}/road-ambush/start`;
const PARTY = ['brann-ironvale', 'elowen-starwhisper', 'maren-ashby', 'tamsin-quickfoot'];

/** The party travels to the Old Trade Road, as the DM moves each character there. */
async function partyOnTheRoad(engine: WorldEngine, who = PARTY) {
  for (const entityId of who) {
    const result = await engine.execute({
      commandId: `test.travel.${entityId}`,
      campaignId: 'ravenford',
      actor: { actorId: 'dm-ravenford', kind: 'user' },
      command: { type: 'PlaceEntity', entityId, locationId: 'old-trade-road' },
    });
    expect(result.status).toBe('accepted');
  }
}

describe('prepared encounters', () => {
  it('lists the road ambush for the DM alone, in the ADR 0009 order', async () => {
    const app = await ravenfordApp();
    expect((await get(app, LIST)).statusCode).toBe(401);
    expect((await get(app, LIST, TOKENS.outsider)).statusCode).toBe(404);
    expect((await get(app, LIST, TOKENS.player)).statusCode).toBe(403);
    const listed = (await get(app, LIST, TOKENS.dm)).json<PreparedEncounterListResponse>();
    expect(listed.encounters).toEqual([
      expect.objectContaining({
        encounterId: 'road-ambush',
        title: 'Ambush on the Old Trade Road',
        location: { entityId: 'old-trade-road', kind: 'location', name: 'Old Trade Road' },
        foes: 11,
        party: [],
        blocked: 'no-party',
      }),
    ]);
    const refused = await post(app, START, { requestId: randomUUID() }, TOKENS.dm);
    expect(refused.statusCode).toBe(409);
    expect(refused.json<{ reason: string }>().reason).toBe('no-party');
    expect((await post(app, START, { requestId: 'nope' }, TOKENS.dm)).statusCode).toBe(400);
    expect((await post(app, START, { requestId: randomUUID() }, TOKENS.player)).statusCode).toBe(
      403,
    );
  });

  it('starts the ambush with the party of four and eleven foes, once per request', async () => {
    const engine = await seededEngine();
    const app = await ravenfordApp(engine);
    await partyOnTheRoad(engine);
    const listed = (await get(app, LIST, TOKENS.dm)).json<PreparedEncounterListResponse>();
    expect(listed.encounters[0]?.party.map((ref) => ref.entityId)).toEqual(PARTY);
    expect(listed.encounters[0]?.blocked).toBeNull();
    const requestId = randomUUID();
    const started = await post(app, START, { requestId }, TOKENS.dm);
    expect(started.json()).toEqual({ status: 'started', encounterId: 'road-ambush' });
    const encounter = (
      await get(app, `${BASE}/encounter?perspective=DM`, TOKENS.dm)
    ).json<EncounterResponse>().encounter;
    expect(encounter?.combatants).toHaveLength(15);
    const sides = encounter?.combatants.map((combatant) => combatant.side) ?? [];
    expect(sides.filter((side) => side === 'party')).toHaveLength(4);
    // The same request again changes nothing; another one is refused while the fight runs.
    expect((await post(app, START, { requestId }, TOKENS.dm)).json()).toEqual({
      status: 'started',
      encounterId: 'road-ambush',
    });
    const again = await post(app, START, { requestId: randomUUID() }, TOKENS.dm);
    expect(again.json<{ reason: string }>().reason).toBe('in-combat');
    expect(
      (await get(app, LIST, TOKENS.dm)).json<PreparedEncounterListResponse>().encounters[0]
        ?.blocked,
    ).toBe('in-combat');
  });

  it('surprises the side the DM names: its Initiative is rolled with Disadvantage', async () => {
    const engine = await seededEngine();
    const app = await ravenfordApp(engine);
    await partyOnTheRoad(engine);
    const odd = await post(app, START, { requestId: randomUUID(), surprised: 'all' }, TOKENS.dm);
    expect(odd.statusCode).toBe(400);
    const started = await post(
      app,
      START,
      { requestId: randomUUID(), surprised: 'foes' },
      TOKENS.dm,
    );
    expect(started.statusCode).toBe(200);
    const encounter = (
      await get(app, `${BASE}/encounter?perspective=DM`, TOKENS.dm)
    ).json<EncounterResponse>().encounter;
    for (const combatant of encounter?.combatants ?? []) {
      expect(combatant.initiative?.surprised === true, combatant.entity.entityId).toBe(
        combatant.side === 'hostile',
      );
    }
  });

  it('starts with whoever of the party is there', async () => {
    const engine = await seededEngine();
    const app = await ravenfordApp(engine);
    await partyOnTheRoad(engine, ['elowen-starwhisper']);
    const started = await post(app, START, { requestId: randomUUID() }, TOKENS.dm);
    expect(started.statusCode).toBe(200);
    const encounter = (
      await get(app, `${BASE}/encounter?perspective=DM`, TOKENS.dm)
    ).json<EncounterResponse>().encounter;
    expect(encounter?.combatants).toHaveLength(12);
  });
});
