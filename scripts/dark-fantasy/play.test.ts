import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type {
  KnowledgeListResponse,
  PreparedEncounterListResponse,
} from '../../packages/contracts/src/index.ts';
import { collectionPlayFixture } from './play-fixture.ts';
import { SLUGS, loadSource } from './source.ts';
import { foesAt } from './encounters.ts';

// Known regression cases: negating an unknown fact still exposes it to the NPC.
const unknownFacts: Record<string, Record<string, string[]>> = {
  'marrow-crown': {
    'erna-vey': ['желание Дары услышать ответ'],
    'tikhon-kern': ['на неправильную стену', 'новая стрелка нанесена неверно'],
  },
  'thorn-abbey': { 'deya-veres': ['ошибочно подписала', 'подпись копии ошибочна'] },
  'lantern-mere': {
    'elina-orst': ['прилив способен придать'],
    'ruvel-ash': ['ошибочная гипотеза', 'гипотеза о точном завершении старого эпизода ошибочна'],
  },
  'black-sun-forge': {
    'siva-kor': ['ложной инструкцией', 'инструкция ложна'],
    'iven-mor': [
      'ложной инструкции',
      'внушённое убеждение',
      'сопротивление может завершить кромку',
    ],
  },
};

describe.each(SLUGS)('%s real in-memory play', (slug) => {
  it.each([3, 7])(
    'plays %i seats with private knowledge and explicit travel to encounters',
    async (size) => {
      const source = await loadSource(slug);
      const f = await collectionPlayFixture(source, size);
      try {
        const hero = source.cast.heroes[0];
        if (!hero) throw new Error('Missing lead hero');
        const initial = await f.send(
          '/knowledge?perspective=PLAYER',
          undefined,
          'collection-test-player',
        );
        expect(initial.statusCode, initial.body).toBe(200);
        for (const secret of source.world.truth) expect(initial.body).not.toContain(secret);
        for (const npc of source.cast.npcs) expect(initial.body).not.toContain(npc.secret);
        for (const clue of source.clues) expect(initial.body).not.toContain(clue.statement);
        for (const npc of source.cast.npcs) {
          const own = await f.send(`/knowledge?perspective=NPC:${f.id(npc.key)}`);
          expect(own.statusCode, own.body).toBe(200);
          const statements = (own.json() as KnowledgeListResponse).knowledge.map(
            (record) => record.statement,
          );
          expect(statements).toContain(npc.secret);
          for (const other of source.cast.npcs.filter((n) => n.key !== npc.key))
            expect(statements).not.toContain(other.secret);
          const context = statements.join('\n').toLowerCase();
          for (const fragment of unknownFacts[slug]?.[npc.key] ?? [])
            expect(context).not.toContain(fragment.toLowerCase());
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
          expect(
            moved.status === 'accepted' || ('code' in moved && moved.code === 'NO_EFFECT'),
          ).toBe(true);
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
        const firstEncounter = source.encounters[0];
        if (!firstEncounter) throw new Error('Missing encounter');
        // Preparation does not teleport heroes; travel is a separate authorized action.
        for (const member of source.cast.heroes.slice(0, size)) {
          const moved = await f.engine.execute({
            campaignId: f.campaignId,
            commandId: `travel.${member.key}`,
            actor: f.dm,
            command: {
              type: 'PlaceEntity',
              entityId: f.id(member.key),
              locationId: f.id(firstEncounter.location),
            },
          });
          expect(
            moved.status === 'accepted' || ('code' in moved && moved.code === 'NO_EFFECT'),
          ).toBe(true);
        }
        const listed = await f.send('/encounters/prepared');
        expect(listed.statusCode).toBe(200);
        const encounters = (listed.json() as PreparedEncounterListResponse).encounters;
        expect(encounters).toHaveLength(source.encounters.length);
        expect(encounters[0]?.party).toHaveLength(size);
        const request = { requestId: randomUUID() };
        const started = await f.send('/encounters/prepared/scenario-1/start', request);
        expect(started.statusCode, started.body).toBe(200);
        const once = await f.engine.load(f.campaignId);
        const first = source.encounters[0];
        if (!first) throw new Error(`${slug}: no encounter`);
        expect(once?.state.encounter?.combatants.length).toBe(size + foesAt(first, size));
        // Foes stand exactly where prepared; heroes take the prepared party squares in seat order.
        const prepared = f.saved.content.encounters[0]?.combatants ?? [];
        const square = (p: { x: number; y: number } | undefined) => `${p?.x},${p?.y}`;
        const placed = (key: string) =>
          once?.state.encounter?.combatants.find((c) => c.entityId === f.id(key))?.position;
        for (const foe of prepared.filter((c) => c.side === 'hostile'))
          expect(placed(foe.entity)).toEqual(foe.position);
        const party = prepared.filter((c) => c.side === 'party');
        expect(new Set(party.map((c) => square(placed(c.entity))))).toEqual(
          new Set(party.map((c) => square(c.position))),
        );
        expect((await f.send('/encounters/prepared/scenario-1/start', request)).statusCode).toBe(
          200,
        );
        expect((await f.engine.load(f.campaignId))?.state.version).toBe(once?.state.version);
      } finally {
        await f.app.close();
      }
    },
    30000,
  );
});
