import { describe, expect, it } from 'vitest';

import { holderPerspective } from '../knowledge/perspective.ts';
import type { WorldState } from '../kernel/state.ts';
import { chronicleWorld } from './testing/world.ts';
import { chronicleEntries } from './entries.ts';
import { flashbackFor } from './flashback.ts';

/**
 * Defense in depth (ADR 0024 §1, §7): ADR 0010 already refuses a memory that
 * cites knowledge its holder cannot see, so no accepted history reaches
 * these cases. Should a state ever hold one, a chapter and a flashback still
 * show only the knowledge the perspective may see.
 */
async function citingASecret(): Promise<{ state: WorldState; history: [] }> {
  const world = await chronicleWorld();
  const { state } = await world.snapshot();
  const memory = state.memories.get('mem-party-talk-mira');
  if (!memory) throw new Error('missing memory');
  const memories = new Map(state.memories);
  memories.set(memory.memoryId, {
    ...memory,
    relatedKnowledge: ['dm-reveal-pacing', ...memory.relatedKnowledge],
  });
  return { state: { ...state, memories }, history: [] };
}

describe('a memory citing what its reader may not see', () => {
  it('tells the memory without the hidden knowledge', async () => {
    const { state, history } = await citingASecret();
    const party = holderPerspective(state, { kind: 'PARTY' });
    const { entries } = chronicleEntries(state, history, party, 0, state.clock);
    const talk = entries.find(
      (entry) => entry.source.kind === 'memory' && entry.source.memoryId === 'mem-party-talk-mira',
    );
    expect(talk?.knowledge.map((known) => known.knowledgeId)).toEqual(['party-mira-departure']);
  });

  it('opens a flashback that never quotes the hidden record', async () => {
    const { state, history } = await citingASecret();
    const memory = state.memories.get('mem-party-talk-mira');
    if (!memory) throw new Error('missing memory');
    const memories = new Map(state.memories);
    // Only Thorne's own testimony is cited: the flashback falls back to the memory's own words.
    memories.set(memory.memoryId, { ...memory, relatedKnowledge: ['thorne-departure'] });
    const onlySecret = { ...state, memories };
    const party = holderPerspective(onlySecret, { kind: 'PARTY' });
    expect(
      flashbackFor({ state: onlySecret, history }, party, 'mem-party-talk-mira')?.dialogue,
    ).toEqual({
      text: memory.summary,
      knowledgeType: null,
      speaker: null,
    });
  });
});
