import { describe, expect, it } from 'vitest';

import seed from '../../../../fixtures/ravenford/kernel-seed.json' with { type: 'json' };
import type { Actor } from './actor.ts';
import { SequentialIds, SteppingClock } from './engine/deterministic-sources.ts';
import { InMemoryEventStore } from './engine/in-memory-event-store.ts';
import { submissionsFromScript } from './engine/script.ts';
import { WorldEngine } from './engine/world-engine.ts';
import { auditTrail } from './projections/audit-trail.ts';
import { checkWorldIntegrity } from './projections/integrity.ts';
import { worldViewAt } from './projections/world-view.ts';
import { formatWorldTime, worldTimeAt } from './world-time.ts';

/** Kernel acceptance on the Ravenford fixture (RAVENFORD_SPEC.md, Return / Time). */
const dm: Actor = { actorId: seed.dmActorId, kind: 'user' };

async function seededEngine() {
  const engine = new WorldEngine({
    store: new InMemoryEventStore(),
    ids: new SequentialIds(),
    clock: new SteppingClock(),
  });
  const submissions = submissionsFromScript({
    campaignId: seed.campaignId,
    actor: dm,
    commands: seed.commands,
  });
  for (const submission of submissions) {
    const result = await engine.execute(submission);
    expect(result.status, JSON.stringify(result)).toBe('accepted');
  }
  return { engine, submissions };
}

const run = (engine: WorldEngine, commandId: string, command: Record<string, unknown>) =>
  engine.execute({ commandId, campaignId: seed.campaignId, actor: dm, command });

describe('Ravenford kernel fixture', () => {
  it('seeds a consistent world that starts on Day 1 at 09:00 with Elowen in Market Square', async () => {
    const { engine } = await seededEngine();
    const snapshot = await engine.load(seed.campaignId);
    const state = snapshot?.state;

    expect(state && checkWorldIntegrity(state)).toEqual([]);
    expect(state && formatWorldTime(state.clock)).toBe('Day 1 09:00:00');
    expect(state?.entities.get('elowen-starwhisper')?.placement?.locationId).toBe('market-square');
    expect(state?.entities.get('market-square')?.location).toEqual({
      type: 'site',
      parentId: 'ravenford',
    });
    expect(state?.activeSceneId).toBe('arrival');
  });

  it('is idempotent: seeding twice changes nothing', async () => {
    const { engine, submissions } = await seededEngine();
    const before = await engine.load(seed.campaignId);

    for (const submission of submissions) {
      expect((await engine.execute(submission)).status).toBe('duplicate');
    }
    expect(await engine.load(seed.campaignId)).toEqual(before);
  });

  it("knows Captain Thorne's arrival eight months before Day 1", async () => {
    const { engine } = await seededEngine();
    const history = (await engine.load(seed.campaignId))?.history ?? [];

    expect(worldViewAt(history, worldTimeAt(-200)).entities.get('captain-thorne')?.locationId).toBe(
      'north-gate',
    );
    expect(
      worldViewAt(history, worldTimeAt(-300)).entities.get('captain-thorne')?.locationId,
    ).toBeNull();
    expect(
      worldViewAt(history, worldTimeAt(1, 8)).entities.get('elowen-starwhisper')?.locationId,
    ).toBeNull();
  });

  it('keeps Orin the same entity from Day 1 to Day 2 while his state changes', async () => {
    const { engine } = await seededEngine();
    for (const [id, command] of [
      ['end-arrival', { type: 'EndScene', sceneId: 'arrival' }],
      ['to-day-2', { type: 'AdvanceWorldTime', to: worldTimeAt(2, 8) }],
      [
        'orin-to-market',
        { type: 'PlaceEntity', entityId: 'orin-stonebeard', locationId: 'market-square' },
      ],
    ] as const) {
      expect((await run(engine, id, command)).status).toBe('accepted');
    }
    const history = (await engine.load(seed.campaignId))?.history ?? [];

    const day1 = worldViewAt(history, worldTimeAt(1, 12)).entities.get('orin-stonebeard');
    const day2 = worldViewAt(history, worldTimeAt(2, 8)).entities.get('orin-stonebeard');
    expect(day1).toMatchObject({ entityId: 'orin-stonebeard', locationId: 'orins-alchemy' });
    expect(day2).toMatchObject({ entityId: 'orin-stonebeard', locationId: 'market-square' });
    expect(
      auditTrail(history, { filter: { entityId: 'orin-stonebeard' } }).map((entry) => entry.type),
    ).toEqual(['EntityCreated', 'EntityPlaced', 'EntityPlaced']);
  });

  it('refuses to declare Orin dead without the DM', async () => {
    const { engine } = await seededEngine();
    const player: Actor = { actorId: 'player-elowen', kind: 'user' };

    const result = await engine.execute({
      commandId: 'orin-dies',
      campaignId: seed.campaignId,
      actor: player,
      command: { type: 'ChangeEntityStatus', entityId: 'orin-stonebeard', status: 'dead' },
    });

    expect(result).toMatchObject({ status: 'rejected', code: 'FORBIDDEN' });
    expect(
      (await engine.load(seed.campaignId))?.state.entities.get('orin-stonebeard')?.status,
    ).toBe('active');
  });
});
