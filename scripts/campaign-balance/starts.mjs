import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { table } from '../campaign-rehearsal/table.mjs';

const book = JSON.parse(readFileSync('fixtures/hollowmere-ru/encounters.json')).encounters;
for (const [key, small, full] of [
  ['willow-ford-ambush', 3, 4],
  ['cellar-rats', 3, 5],
  ['sunken-mill', 2, 4],
  ['sunken-bell', 2, 4],
]) {
  const card = book.find((e) => e.encounterId === key);
  for (const size of [3, 4]) {
    const f = await table('hollowmere');
    try {
      for (const entityId of f.party.slice(0, size))
        await f.cmd({ type: 'PlaceEntity', entityId, locationId: card.locationId });
      const base = '/encounters/prepared';
      const preview = (await f.request(base)).encounters.find((e) => e.encounterId === key);
      assert.equal(preview.party.length, size);
      assert.equal(preview.foes, size === 3 ? small : full);
      const request = { requestId: randomUUID() };
      const start = () => f.request(base + '/' + key + '/start', request);
      assert.equal((await start()).status, 'started');
      assert.equal((await start()).status, 'started');
      const { encounter } = await f.request('/encounter?perspective=DM');
      const actual = encounter.combatants.filter((c) => c.side === 'hostile');
      assert.equal(actual.length, preview.foes);
      assert.deepEqual(
        actual.map((c) => c.entity.entityId).sort(),
        card.foes
          .filter((c) => (c.minPartySize ?? 1) <= size)
          .map((c) => c.entityId)
          .sort(),
      );
    } finally {
      await f.close();
    }
  }
}
process.stdout.write('Hollowmere: preview, start and retry passed for all eight tables.\n');
