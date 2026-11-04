import { randomUUID } from 'node:crypto';

import type {
  EncounterDifficultyResponse,
  EncounterResponse,
  SavedEncounterRequest,
  SavedEncountersResponse,
} from '@ltw/contracts';
import type { WorldEngine } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { get, post, ravenfordApp, seededEngine, TOKENS } from '../testing/ravenford-app.ts';

/**
 * The DM's encounter builder (docs/adr/0057-encounters-maps-loot.md §1): encounters saved beside
 * the world for the DM alone, with the party's difficulty at the place, started in one step — the
 * bestiary's foes made and numbered, the fight begun — once per request.
 */
const BASE = '/campaigns/ravenford';
const SAVED = `${BASE}/encounters/saved`;
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

const goblins: SavedEncounterRequest = {
  name: 'Goblins at the ford',
  locationId: 'old-trade-road',
  battlefield: { width: 16, height: 12, difficult: [], cover: [] },
  foes: [
    { kind: 'bestiary', monsterId: 'goblin-warrior', position: { x: 15, y: 0 } },
    { kind: 'bestiary', monsterId: 'goblin-warrior', position: { x: 15, y: 2 } },
    { kind: 'bestiary', monsterId: 'ogre', position: { x: 13, y: 4 } },
  ],
  partyStart: [
    { x: 0, y: 1 },
    { x: 0, y: 3 },
    { x: 0, y: 5 },
    { x: 0, y: 7 },
  ],
};

describe('the DM’s saved encounters', () => {
  it('are the DM’s alone, in the ADR 0009 order, and named foes must exist', async () => {
    const app = await ravenfordApp();
    const id = randomUUID();
    expect((await get(app, SAVED)).statusCode).toBe(401);
    expect((await get(app, SAVED, TOKENS.outsider)).statusCode).toBe(404);
    expect((await get(app, SAVED, TOKENS.player)).statusCode).toBe(403);
    expect((await post(app, `${SAVED}/${id}`, goblins, TOKENS.player)).statusCode).toBe(403);
    expect(
      (await post(app, `${SAVED}/${id}`, { ...goblins, name: '' }, TOKENS.dm)).statusCode,
    ).toBe(400);
    const unknown = await post(
      app,
      `${SAVED}/${id}`,
      {
        ...goblins,
        foes: [{ kind: 'bestiary', monsterId: 'no-such-thing', position: { x: 1, y: 1 } }],
      },
      TOKENS.dm,
    );
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json<{ reason: string }>().reason).toBe('foe');
    // A foe in a wall, or two on one square, never reaches the fight.
    const walled = await post(
      app,
      `${SAVED}/${id}`,
      { ...goblins, battlefield: { ...goblins.battlefield, walls: [{ x: 15, y: 0 }] } },
      TOKENS.dm,
    );
    expect(walled.json<{ reason: string }>().reason).toBe('square');
    const crowded = await post(
      app,
      `${SAVED}/${id}`,
      {
        ...goblins,
        foes: [
          ...goblins.foes,
          { kind: 'bestiary', monsterId: 'goblin-warrior', position: { x: 14, y: 5 } },
        ],
      },
      TOKENS.dm,
    );
    expect(crowded.json<{ reason: string }>().reason).toBe('square');
    expect((await post(app, `${SAVED}/${id}`, goblins, TOKENS.dm)).statusCode).toBe(201);
    expect((await post(app, `${SAVED}/${id}`, goblins, TOKENS.dm)).statusCode).toBe(200);
    const listed = (await get(app, SAVED, TOKENS.dm)).json<SavedEncountersResponse>();
    expect(listed.encounters).toEqual([
      expect.objectContaining({
        encounterId: id,
        name: 'Goblins at the ford',
        location: { entityId: 'old-trade-road', kind: 'location', name: 'Old Trade Road' },
        party: [],
        difficulty: null,
        blocked: 'no-party',
      }),
    ]);
    expect(listed.encounters[0]?.foes.map((foe) => [foe.name, foe.challenge, foe.size])).toEqual([
      ['Goblin Warrior', '1/4', 'small'],
      ['Goblin Warrior', '1/4', 'small'],
      ['Ogre', '2', 'large'],
    ]);
    expect((await post(app, `${SAVED}/${id}/delete`, {}, TOKENS.dm)).statusCode).toBe(204);
    expect((await post(app, `${SAVED}/${id}/delete`, {}, TOKENS.dm)).statusCode).toBe(404);
    expect((await get(app, SAVED, TOKENS.dm)).json<SavedEncountersResponse>().encounters).toEqual(
      [],
    );
  });

  it('weighs the foes against the party at the place as the DM builds', async () => {
    const engine = await seededEngine();
    const app = await ravenfordApp(engine);
    const before = await post(
      app,
      `${BASE}/encounters/difficulty`,
      { locationId: 'old-trade-road', foes: goblins.foes },
      TOKENS.dm,
    );
    expect(before.json<EncounterDifficultyResponse>().difficulty).toBeNull();
    await partyOnTheRoad(engine);
    const weighed = (
      await post(
        app,
        `${BASE}/encounters/difficulty`,
        { locationId: 'old-trade-road', foes: goblins.foes },
        TOKENS.dm,
      )
    ).json<EncounterDifficultyResponse>();
    expect(weighed.party.map((ref) => ref.entityId)).toEqual(PARTY);
    // Two goblin warriors (50 XP each) and an ogre (450).
    expect(weighed.difficulty).toMatchObject({ xp: 550, unknown: 0, rating: 'low' });
  });

  it('starts with the foes made and numbered, the party at its squares, once per request', async () => {
    const engine = await seededEngine();
    const app = await ravenfordApp(engine);
    await partyOnTheRoad(engine);
    const id = randomUUID();
    expect((await post(app, `${SAVED}/${id}`, goblins, TOKENS.dm)).statusCode).toBe(201);
    const requestId = randomUUID();
    const start = () => post(app, `${SAVED}/${id}/start`, { requestId }, TOKENS.dm);
    expect((await start()).json()).toEqual({ status: 'started', encounterId: id });
    // A retried request starts nothing twice.
    expect((await start()).json()).toEqual({ status: 'started', encounterId: id });
    const encounter = (
      await get(app, `${BASE}/encounter?perspective=DM`, TOKENS.dm)
    ).json<EncounterResponse>().encounter;
    expect(encounter?.combatants).toHaveLength(7);
    const foes = encounter?.combatants.filter((one) => one.side === 'hostile') ?? [];
    expect(foes.map((one) => one.entity.name).sort()).toEqual([
      'Goblin Warrior 1',
      'Goblin Warrior 2',
      'Ogre',
    ]);
    expect(foes.find((one) => one.entity.name === 'Ogre')?.position).toEqual({ x: 13, y: 4 });
    const party = encounter?.combatants.filter((one) => one.side === 'party') ?? [];
    expect(party.map((one) => one.position).sort((a, b) => a.y - b.y)).toEqual(goblins.partyStart);
    // A second start while the fight runs is refused.
    const again = await post(app, `${SAVED}/${id}/start`, { requestId: randomUUID() }, TOKENS.dm);
    expect(again.statusCode).toBe(409);
  });

  it('keeps one whose creature is gone listed, to be changed or deleted, never started', async () => {
    const engine = await seededEngine();
    const app = await ravenfordApp(engine);
    await partyOnTheRoad(engine);
    const dm = { actorId: 'dm-ravenford', kind: 'user' } as const;
    const made = await engine.execute({
      commandId: 'test.wolf',
      campaignId: 'ravenford',
      actor: dm,
      command: {
        type: 'CreateEntity',
        entityId: 'creature-0a1b2c3d',
        kind: 'creature',
        name: 'Grey Wolf',
        existsSince: null,
        placement: { locationId: 'old-trade-road', since: null },
      },
    });
    expect(made.status).toBe('accepted');
    const block = (await engine.load('ravenford'))?.state.statBlocks.get('creature-10fb59d4');
    expect(
      (
        await engine.execute({
          commandId: 'test.wolf.block',
          campaignId: 'ravenford',
          actor: dm,
          command: { type: 'SetStatBlock', entityId: 'creature-0a1b2c3d', statBlock: block },
        })
      ).status,
    ).toBe('accepted');
    const id = randomUUID();
    const withWolf: SavedEncounterRequest = {
      ...goblins,
      foes: [{ kind: 'creature', entityId: 'creature-0a1b2c3d', position: { x: 15, y: 0 } }],
    };
    expect((await post(app, `${SAVED}/${id}`, withWolf, TOKENS.dm)).statusCode).toBe(201);
    // The DM takes the wolf back out of the world.
    for (const target of ['test.wolf.block', 'test.wolf'])
      expect(
        (
          await engine.execute({
            commandId: `${target}.undo`,
            campaignId: 'ravenford',
            actor: dm,
            command: { type: 'UndoCommand', targetCommandId: target },
          })
        ).status,
      ).toBe('accepted');
    const listed = (await get(app, SAVED, TOKENS.dm)).json<SavedEncountersResponse>().encounters;
    expect(listed).toEqual([
      expect.objectContaining({ encounterId: id, foes: [], blocked: 'gone', difficulty: null }),
    ]);
    const start = await post(app, `${SAVED}/${id}/start`, { requestId: randomUUID() }, TOKENS.dm);
    expect(start.statusCode).toBe(409);
    expect((await post(app, `${SAVED}/${id}/delete`, {}, TOKENS.dm)).statusCode).toBe(204);
  });
});
