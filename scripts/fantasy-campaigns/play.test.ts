import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type {
  KnowledgeListResponse,
  PreparedEncounterListResponse,
} from '../../packages/contracts/src/index.ts';
import { collectionPlayFixture } from './play-fixture.ts';
import { foesAt } from './encounters.ts';
import { SLUGS, loadSource } from './source.ts';

async function placeParty(
  f: Awaited<ReturnType<typeof collectionPlayFixture>>,
  location: string,
): Promise<void> {
  for (const key of f.saved.content.party) {
    const moved = await f.engine.execute({
      campaignId: f.campaignId,
      commandId: `party-visit.${key}`,
      actor: f.dm,
      command: { type: 'PlaceEntity', entityId: f.id(key), locationId: f.id(location) },
    });
    expect(moved.status === 'accepted' || ('code' in moved && moved.code === 'NO_EFFECT')).toBe(
      true,
    );
  }
}

describe.each(SLUGS)('%s real in-memory play', (slug) => {
  it('activates eight seats, keeps initial secrets private and reveals clues through legal inspection', async () => {
    const source = await loadSource(slug);
    const f = await collectionPlayFixture(source);
    try {
      const hero = source.cast.heroes[0];
      if (!hero) throw new Error('Missing lead hero');
      const initial = await f.send(
        '/knowledge?perspective=PLAYER',
        undefined,
        'collection-test-player',
      );
      expect(initial.statusCode, initial.body).toBe(200);
      const initialStatements = (initial.json() as KnowledgeListResponse).knowledge.map(
        (record) => record.statement,
      );
      for (const secret of source.world.truth) expect(initialStatements).not.toContain(secret);
      for (const npc of source.cast.npcs) expect(initialStatements).not.toContain(npc.secret);
      for (const clue of source.clues) expect(initialStatements).not.toContain(clue.statement);
      for (const npc of source.cast.npcs) {
        const own = await f.send(`/knowledge?perspective=NPC:${f.id(npc.key)}`);
        expect(own.statusCode, own.body).toBe(200);
        const statements = (own.json() as KnowledgeListResponse).knowledge.map(
          (record) => record.statement,
        );
        expect(statements).toContain(npc.secret);
        for (const other of source.cast.npcs.filter((n) => n.key !== npc.key))
          expect(statements).not.toContain(other.secret);
      }
      expect(
        (await f.send('/encounters/prepared', undefined, 'collection-test-outsider')).statusCode,
      ).toBe(404);
      expect(
        (await f.send('/encounters/prepared', undefined, 'collection-test-player')).statusCode,
      ).toBe(403);
      for (const clue of source.clues) {
        const moved = await f.engine.execute({
          campaignId: f.campaignId,
          commandId: `visit.${clue.key}`,
          actor: f.dm,
          command: {
            type: 'PlaceEntity',
            entityId: f.id(hero.key),
            locationId: f.id(clue.location),
          },
        });
        expect(moved.status === 'accepted' || ('code' in moved && moved.code === 'NO_EFFECT')).toBe(
          true,
        );
        const examined = await f.send(
          '/commands',
          {
            commandId: `inspect.${clue.key}`,
            command: {
              type: 'ExamineEntity',
              characterId: f.id(hero.key),
              entityId: f.id(`e-${clue.key}`),
              method: 'inspect',
            },
          },
          'collection-test-player',
        );
        expect(examined.statusCode, examined.body).toBe(200);
        const known = await f.send(
          '/knowledge?perspective=PLAYER',
          undefined,
          'collection-test-player',
        );
        expect(
          (known.json() as KnowledgeListResponse).knowledge.map((record) => record.statement),
          clue.key,
        ).toContain(clue.statement);
      }
      const firstEncounter = source.encounters[0];
      if (!firstEncounter) throw new Error('Missing prepared encounter');
      await placeParty(f, firstEncounter.location);
      const listed = await f.send('/encounters/prepared');
      expect(listed.statusCode).toBe(200);
      const encounters = (listed.json() as PreparedEncounterListResponse).encounters;
      expect(encounters).toHaveLength(source.encounters.length);
      expect(encounters[0]?.party).toHaveLength(8);
      const request = { requestId: randomUUID() };
      const started = await f.send('/encounters/prepared/scenario-1/start', request);
      expect(started.statusCode, started.body).toBe(200);
      const once = await f.engine.load(f.campaignId);
      const first = source.encounters[0];
      if (!first) throw new Error(`${slug}: no encounter`);
      expect(once?.state.encounter?.combatants.length).toBe(8 + foesAt(first, 8));
      expect((await f.send('/encounters/prepared/scenario-1/start', request)).statusCode).toBe(200);
      expect((await f.engine.load(f.campaignId))?.state.version).toBe(once?.state.version);
    } finally {
      await f.app.close();
    }
  }, 30000);

  it('starts every optional encounter with the three-player core and no absent hero', async () => {
    const source = await loadSource(slug);
    for (const [index, encounter] of source.encounters.entries()) {
      const f = await collectionPlayFixture(source, 3);
      try {
        if (encounter.location !== source.world.startLocation) {
          const before = (await f.engine.load(f.campaignId))?.state.version;
          const absent = await f.send(`/encounters/prepared/scenario-${index + 1}/start`, {
            requestId: randomUUID(),
          });
          expect(absent.statusCode, absent.body).toBe(409);
          expect(absent.body).toContain('no-party');
          expect((await f.engine.load(f.campaignId))?.state.version).toBe(before);
        }
        await placeParty(f, encounter.location);
        const denied = await f.send(
          `/encounters/prepared/scenario-${index + 1}/start`,
          { requestId: randomUUID() },
          'collection-test-player',
        );
        expect(denied.statusCode).toBe(403);
        expect((await f.engine.load(f.campaignId))?.state.encounter).toBeNull();
        const result = await f.send(`/encounters/prepared/scenario-${index + 1}/start`, {
          requestId: randomUUID(),
        });
        expect(result.statusCode, result.body).toBe(200);
        const state = (await f.engine.load(f.campaignId))?.state;
        expect(state?.encounter?.combatants.length).toBe(3 + foesAt(encounter, 3));
        for (const omitted of source.cast.heroes.slice(3))
          expect(f.saved.content.entities.some((e) => e.key === omitted.key)).toBe(false);
      } finally {
        await f.app.close();
      }
    }
  }, 30000);
});
