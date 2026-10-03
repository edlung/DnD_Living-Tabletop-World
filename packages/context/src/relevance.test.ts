import type { WorldState } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { entityContext } from './entity-context.ts';
import { elowenView, seedRavenford } from './testing/ravenford.ts';

/** ADR 0014 §5: a visible contradiction is an open question for relevance. */
const askAboutInn = (state: WorldState) => {
  const result = entityContext(state, elowenView(state), 'mira-vale');
  if (!result.ok) throw new Error(result.reason);
  return result.context.actions.find(
    (action) => action.id === 'ask_about' && action.topic?.entityId === 'golden-stag-inn',
  );
};

describe('contradictions and relevance', () => {
  it('ignores contradictions the party cannot see', async () => {
    const baseline = await seedRavenford();
    const hidden = await seedRavenford();
    const orinRecord = (knowledgeId: string, value: string) => [
      {
        type: 'AddKnowledge',
        knowledgeId,
        scope: { kind: 'NPC', npcId: 'orin-stonebeard' },
        knowledgeType: 'FACT',
        statement: `The inn ${value}.`,
        subjects: ['golden-stag-inn'],
        knownSince: null,
      },
      {
        type: 'SetClaim',
        target: { kind: 'knowledge', knowledgeId },
        claim: { subjectId: 'golden-stag-inn', aspect: 'open', value },
      },
    ];
    const state = await hidden.apply(
      ...orinRecord('x-a', 'is-open'),
      ...orinRecord('x-b', 'is-closed'),
    );
    // Orin's contradiction exists, but the party cannot see it: no effect on Elowen.
    expect([...state.knowledge.values()].some((k) => k.knowledgeType === 'CONTRADICTION')).toBe(
      true,
    );
    expect(askAboutInn(state)).toEqual(askAboutInn(baseline.state));
  });

  it('raises a topic that only a contradiction makes open', async () => {
    const world = await seedRavenford();
    const records = ['x-1', 'x-2'].flatMap((knowledgeId, index) => [
      {
        type: 'AddKnowledge',
        knowledgeId,
        scope: { kind: 'PARTY' },
        knowledgeType: 'EVIDENCE',
        statement: `Sign ${String(index)} at the inn.`,
        subjects: ['golden-stag-inn'],
        knownSince: null,
      },
      {
        type: 'SetClaim',
        target: { kind: 'knowledge', knowledgeId },
        claim: { subjectId: 'golden-stag-inn', aspect: 'open', value: index === 0 ? 'yes' : 'no' },
      },
    ]);
    const plain = await seedRavenford();
    const withoutConflict = await plain.apply(...records.slice(0, 3));
    expect(askAboutInn(withoutConflict)?.relevance).not.toBe('high');
    const conflicted = await world.apply(...records);
    expect(askAboutInn(conflicted)?.relevance).toBe('high');
  });
});
