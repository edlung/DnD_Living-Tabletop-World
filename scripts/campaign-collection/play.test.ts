import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type {
  KnowledgeListResponse,
  PreparedEncounterListResponse,
} from '../../packages/contracts/src/index.ts';
import { collectionPlayFixture } from './play-fixture.ts';
import { foesAt } from './encounters.ts';
import { SLUGS, loadSource } from './source.ts';

// Unknown secrets must not enter an NPC context even through a negated spoiler.
const orbitUnknown: Record<string, string[]> = {
  'mira-ker': ['замысла Весты', 'сделки Сора', 'намерений пилота'],
  'vesta-rin': ['ранний отчёт Миры'],
  'sor-dar': ['заранее написанного отчёта'],
  'nika-sol': ['замысла Вея'],
  'esh-lar': ['отчёте Миры', 'приказе Весте'],
};

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
        for (const known of [...npc.knows, npc.secret]) expect(statements).toContain(known);
        for (const other of source.cast.npcs.filter((n) => n.key !== npc.key))
          if (!npc.knows.includes(other.secret)) expect(statements).not.toContain(other.secret);
        if (slug === 'last-orbit')
          for (const fragment of orbitUnknown[npc.key] ?? [])
            expect(statements.join('\n'), npc.key).not.toContain(fragment);
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
        expect(known.body, clue.key).toContain(clue.statement);
      }
      const encounterLocation = source.encounters[0]?.location;
      if (!encounterLocation) throw new Error('Missing first encounter location');
      for (const member of source.cast.heroes) {
        const assembled = await f.engine.execute({
          campaignId: f.campaignId,
          commandId: `assemble.${member.key}`,
          actor: f.dm,
          command: {
            type: 'PlaceEntity',
            entityId: f.id(member.key),
            locationId: f.id(encounterLocation),
          },
        });
        expect(
          assembled.status === 'accepted' ||
            ('code' in assembled && assembled.code === 'NO_EFFECT'),
        ).toBe(true);
      }
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
});
