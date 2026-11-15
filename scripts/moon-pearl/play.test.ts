import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import type { PreparedEncounterListResponse } from '../../packages/contracts/src/index.ts';
import { createCampaignEncounterBooks } from '../../apps/server/src/campaigns/encounter-books.ts';
import { pearlPlayFixture } from './play-fixture.ts';
import { foeRoster } from '../campaign-shared/combat-kit.ts';
import { PEARL_ENCOUNTERS } from './encounters.ts';

it('publishes the pearl package and starts a prepared encounter with three heroes, once', async () => {
  const f = await pearlPlayFixture();
  try {
    for (const hero of f.saved.content.party) {
      const moved = await f.engine.execute({
        campaignId: f.campaignId,
        commandId: `prepare-visit.${hero}`,
        actor: f.dm,
        command: { type: 'PlaceEntity', entityId: f.id(hero), locationId: f.id('glass') },
      });
      expect(moved.status).toBe('accepted');
    }
    const listed = await f.send('/encounters/prepared');
    const encounters = (listed.json() as PreparedEncounterListResponse).encounters;
    expect(encounters).toHaveLength(3);
    expect(encounters.some((entry) => entry.location.entityId === f.id('passage'))).toBe(false);
    const beforeRemovedStart = await f.engine.load(f.campaignId);
    const removed = await f.send('/encounters/prepared/scenario-4/start', {
      requestId: randomUUID(),
    });
    expect(removed.statusCode).toBe(404);
    expect((await f.engine.load(f.campaignId))?.state.version).toBe(
      beforeRemovedStart?.state.version,
    );
    expect(encounters[0]?.party).toHaveLength(3);
    expect(encounters[0]?.location.entityId).toBe(f.id('glass'));
    expect(
      (await f.send('/encounters/prepared', undefined, 'pearl-test-outsider')).statusCode,
    ).toBe(404);
    const request = { requestId: randomUUID() };
    const started = await f.send('/encounters/prepared/scenario-1/start', request);
    expect(started.statusCode, started.body).toBe(200);
    const once = await f.engine.load(f.campaignId);
    const first = PEARL_ENCOUNTERS[0];
    if (!first) throw new Error('No prepared encounter');
    expect(once?.state.encounter?.combatants.length).toBe(3 + foeRoster(first, 3).length);
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
  const f = await pearlPlayFixture();
  try {
    expect((await f.send('/encounters/prepared', undefined, 'pearl-test-player')).statusCode).toBe(
      403,
    );
    const initial = await f.send('/knowledge?perspective=PLAYER', undefined, 'pearl-test-player');
    expect(initial.statusCode).toBe(200);
    expect(initial.body).not.toContain('Люсьен');
    const { clues } = await import('./data.ts');
    let location = 'museum';
    for (const clue of clues) {
      if (location !== clue.location) {
        const moved = await f.engine.execute({
          campaignId: f.campaignId,
          commandId: `visit.${clue.key}`,
          actor: f.dm,
          command: {
            type: 'PlaceEntity',
            entityId: f.id('toren'),
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
            characterId: f.id('toren'),
            entityId: f.id(`e-${clue.key}`),
            method: 'inspect',
          },
        },
        'pearl-test-player',
      );
      expect(examined.statusCode, examined.body).toBe(200);
      const known = await f.send('/knowledge?perspective=PLAYER', undefined, 'pearl-test-player');
      expect(known.body, clue.key).toContain(clue.statement);
    }
  } finally {
    await f.app.close();
  }
});
