import { describe, expect, it } from 'vitest';

import { holderPerspective } from '../knowledge/perspective.ts';
import { hash } from '../assets/testing/world.ts';
import { DM_VIEW } from '../visual/testing/world.ts';
import { chronicleWorld } from './testing/world.ts';
import { flashbackFor } from './flashback.ts';

/**
 * The minimal flashback (RAVENFORD_SPEC.md, Chronicle; ADR 0024 §7): a
 * memory opened as a scene image, a fragment of dialogue, the participants,
 * and the world time, for a perspective that may recall it.
 */
describe('the flashback of Mira’s account', () => {
  it('shows the square as it looked, Mira’s words as her testimony, and its sources', async () => {
    const world = await chronicleWorld();
    await world.approved('market-square', 1);
    await world.approved('mira-vale', 2);
    const snapshot = await world.snapshot();
    const party = holderPerspective(snapshot.state, { kind: 'PARTY' });
    const flashback = flashbackFor(snapshot, party, 'mem-party-talk-mira');
    expect(flashback).toMatchObject({
      memoryId: 'mem-party-talk-mira',
      worldTime: 34_200,
      phase: 'day',
      scene: { entityId: 'market-square', image: { contentHash: hash(1) } },
      dialogue: {
        text: 'Mira Vale says the caravan left before dawn.',
        knowledgeType: 'TESTIMONY',
        speaker: { entityId: 'mira-vale', name: 'Mira Vale' },
      },
    });
    expect(flashback?.participants.map((p) => p.entity.entityId)).toEqual([
      'elowen-starwhisper',
      'mira-vale',
    ]);
    expect(
      flashback?.participants.find((p) => p.entity.entityId === 'mira-vale')?.presentation?.image
        ?.contentHash,
    ).toBe(hash(2));
    expect(flashback?.sources.map((source) => source.eventType)).toEqual([
      'MemoryRecorded',
      'KnowledgeAssigned',
    ]);
    expect(flashback?.sources.every((source) => source.sequence === undefined)).toBe(true);
  });

  it('falls back to the memory’s own words, and opens nothing it may not recall', async () => {
    const world = await chronicleWorld();
    const snapshot = await world.snapshot();
    const party = holderPerspective(snapshot.state, { kind: 'PARTY' });
    expect(flashbackFor(snapshot, party, 'mem-party-decide-road')?.dialogue).toEqual({
      text: 'We decided to search the Old Trade Road for the caravan.',
      knowledgeType: null,
      speaker: null,
    });
    for (const hidden of ['mem-mira-departure', 'mem-elowen-mira-glance', 'no-such-memory']) {
      expect(flashbackFor(snapshot, party, hidden)).toBeNull();
    }
    expect(flashbackFor(snapshot, DM_VIEW, 'mem-mira-departure')?.sources[0]?.sequence).toEqual(
      expect.any(Number),
    );
  });
});
