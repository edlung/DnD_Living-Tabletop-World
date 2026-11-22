import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { table } from './table.mjs';

// Same visits, with and without a contested exit. The bell rope and Matthis are untouched.
export async function bellReturn(fight) {
  const f = await table('hollowmere');
  try {
    const lead = f.seats[0];
    const journal = async () =>
      (await f.request('/quests?perspective=PLAYER', undefined, lead.token)).quests;
    const offer = (await journal())[0].transitions[0].summary;
    const place = (who, where) => f.cmd({ type: 'PlaceEntity', entityId: who, locationId: where });
    const battles = (await f.request('/encounters/prepared')).encounters;
    const chamber = battles.find((b) => b.encounterId === 'sunken-bell');
    for (const subject of ['hollowmere-bell', 'old-matthis']) {
      await f.cmd({
        type: 'AddKnowledge',
        scope: { kind: 'PARTY' },
        knowledgeType: 'FACT',
        statement:
          subject === 'old-matthis'
            ? 'У ворот спрашивают о пропавшем звонаре.'
            : 'Из деревни слышен звон.',
        subjects: [subject],
        knownSince: null,
      });
    }
    await place(lead.id, battles.find((b) => b.encounterId === 'flooded-stair').location.entityId);
    for (const seat of f.seats) await place(seat.id, chamber.location.entityId);
    if (fight) {
      await f.request('/encounters/prepared/sunken-bell/start', { requestId: randomUUID() });
      await f.cmd({ type: 'EndCombat', encounterId: (await f.state()).encounter.encounterId });
    }
    await place(lead.id, 'hollowmere');
    const after = await journal();
    return {
      offer,
      fight,
      transitions: Object.fromEntries(
        after.map((q) => [q.questId, q.transitions.map((e) => e.summary)]),
      ),
    };
  } finally {
    await f.close();
  }
}
export function checkReturn(log) {
  assert.match(log.offer, /предложила/);
  assert.ok(
    log.transitions['bells-of-hollowmere'].some((line) => line.includes('снова в Холлоумире')),
  );
  assert.doesNotMatch(
    Object.values(log.transitions).flat().join(' '),
    /умолкнуть|снова дома|довезли повозку|нашёлся в склепе/,
  );
}
