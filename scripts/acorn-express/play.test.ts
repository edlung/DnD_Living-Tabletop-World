import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import type { PreparedEncounterListResponse } from '../../packages/contracts/src/index.ts';
import { createCampaignEncounterBooks } from '../../apps/server/src/campaigns/encounter-books.ts';
import { acornPlayFixture } from './play-fixture.ts';

it('publishes the acorn package and starts a prepared encounter with three heroes, once', async () => {
  const f = await acornPlayFixture();
  try {
    const listed = await f.send('/encounters/prepared');
    const encounters = (listed.json() as PreparedEncounterListResponse).encounters;
    expect(encounters).toHaveLength(3);
    expect(encounters[0]?.party).toHaveLength(3);
    expect(encounters[0]?.location.entityId).toBe(f.id('station'));
    expect(
      (await f.send('/encounters/prepared', undefined, 'acorn-test-outsider')).statusCode,
    ).toBe(404);
    const request = { requestId: randomUUID() };
    const started = await f.send('/encounters/prepared/scenario-1/start', request);
    expect(started.statusCode, started.body).toBe(200);
    const once = await f.engine.load(f.campaignId);
    expect(once?.state.encounter?.combatants.length).toBe(5);
    expect((await f.send('/encounters/prepared/scenario-1/start', request)).statusCode).toBe(200);
    expect((await f.engine.load(f.campaignId))?.state.version).toBe(once?.state.version);
    const books = createCampaignEncounterBooks(f.content);
    expect(await books.get(f.campaignId, 'wrong-digest')).toBeNull();
    expect(
      await books.get('another-campaign', f.snapshot.state.bootstrap?.source.scenarioDigest ?? ''),
    ).toBeNull();
  } finally {
    await f.app.close();
  }
});

it('keeps the antagonist private and lets a player inspect every essential clue without a roll', async () => {
  const f = await acornPlayFixture();
  try {
    expect((await f.send('/encounters/prepared', undefined, 'acorn-test-player')).statusCode).toBe(
      403,
    );
    const initial = await f.send('/knowledge?perspective=PLAYER', undefined, 'acorn-test-player');
    expect(initial.statusCode).toBe(200);
    expect(initial.body).not.toContain('Вельт');
    const { clues } = await import('./data.ts');
    let location = 'station';
    for (const clue of clues) {
      if (location !== clue.location) {
        const moved = await f.engine.execute({
          campaignId: f.campaignId,
          commandId: `visit.${clue.key}`,
          actor: f.dm,
          command: {
            type: 'PlaceEntity',
            entityId: f.id('boris'),
            locationId: f.id(clue.location),
          },
        });
        expect(moved.status, JSON.stringify(moved)).toBe('accepted');
        location = clue.location;
      }
      const examined = await f.send(
        '/commands',
        {
          commandId: `inspect.${clue.key}`,
          command: {
            type: 'ExamineEntity',
            characterId: f.id('boris'),
            entityId: f.id(`e-${clue.key}`),
            method: 'inspect',
          },
        },
        'acorn-test-player',
      );
      expect(examined.statusCode, examined.body).toBe(200);
      const known = await f.send('/knowledge?perspective=PLAYER', undefined, 'acorn-test-player');
      expect(known.body, clue.key).toContain(clue.statement);
    }
  } finally {
    await f.app.close();
  }
});
