import type { CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { listKnowledge } from '../knowledge/queries.ts';
import { holderPerspective } from '../knowledge/perspective.ts';
import { CAMPAIGN, ELOWEN, investigationWorld } from './testing/world.ts';

/**
 * Stage 60 validation gate: the end-to-end investigation path (Mira → Missing
 * Caravan → caravan site → evidence → hypotheses) passes without
 * hypothesis→fact promotion (ARCHITECTURE_INVARIANTS.md #7, ADR 0013).
 */
const PARTY_MUST_NOT_LEARN = [
  'Ashen',
  '3f9c2b7e-5a1d-4e8f-9b06-7c4d2e1a8f53',
  'alchemical',
  'manipulated',
  'arranged',
  'not simply goblins',
  'mark of',
  'theory is wrong',
  'Reveal the',
  'reagent',
  'personally',
  'recognized the same symbol',
  'after sunrise',
  'patrol',
  'route followed',
];

function ok(result: CommandResult) {
  if (result.status === 'rejected') throw new Error(`${result.code}: ${result.message}`);
  return result;
}

describe('investigation path', () => {
  it('runs from Mira to a hypothesis, and no hypothesis ever becomes a fact', async () => {
    const world = await investigationWorld();
    const act = async (command: Record<string, unknown>) =>
      ok(await world.submit({ characterId: ELOWEN, ...command }));
    const goblinTheoryBefore = (await world.state()).knowledge.get('party-goblin-hypothesis');

    // Market Square: Mira shares what she is willing to share.
    await act({ type: 'AskAbout', npcId: 'mira-vale', topicId: 'guild-caravan' });
    await act({ type: 'AskAbout', npcId: 'mira-vale', topicId: 'old-trade-road' });

    // Travel to the site, perceived only once on the road.
    await act({ type: 'EnterLocation', locationId: 'old-trade-road' });
    await act({ type: 'EnterLocation', locationId: 'abandoned-caravan-site' });

    // Investigate: inspect everything, then roll checks (d20 queued; modifiers +8 / +12).
    const evidence: string[] = [];
    const examine = async (entityId: string, method: string) => {
      const result = await act({ type: 'ExamineEntity', entityId, method });
      if (result.outcome?.kind === 'ExamineEntity') evidence.push(...result.outcome.discovered);
    };
    for (const entityId of [
      'abandoned-caravan-site',
      'broken-wagon-wheel',
      'goblin-weapon',
      'strange-symbol',
      'burned-cargo',
    ]) {
      await examine(entityId, 'inspect');
    }
    world.roll(9, 3, 11, 4, 2); // wheel 17 ✓, blade 11 ✗, symbol 19 ✓, cargo 12 ✓, tracks 14 ✓
    await examine('broken-wagon-wheel', 'investigation');
    await examine('goblin-weapon', 'investigation');
    await examine('strange-symbol', 'investigation');
    await examine('burned-cargo', 'investigation');
    await examine('wagon-tracks', 'perception');
    expect(evidence).toHaveLength(9);

    // The party forms a competing hypothesis from what it found.
    const hypothesis = await act({
      type: 'FormHypothesis',
      scope: 'PARTY',
      statement: 'The attack was staged to look like goblins.',
      subjects: ['guild-caravan'],
      relations: [
        { type: 'CONTRADICTS', knowledgeId: 'party-goblin-hypothesis' },
        ...evidence.slice(0, 3).map((knowledgeId) => ({ type: 'SUPPORTS', knowledgeId })),
      ],
    });

    const state = await world.state();
    const party = holderPerspective(state, { kind: 'PARTY' });
    const visible = listKnowledge(state, party, {});
    if (!visible.ok) throw new Error('party view failed');
    const byId = new Map(visible.knowledge.map((view) => [view.knowledgeId, view]));

    // Both hypotheses remain hypotheses; the old one is untouched.
    expect(state.knowledge.get('party-goblin-hypothesis')).toEqual(goblinTheoryBefore);
    const newId =
      hypothesis.outcome?.kind === 'FormHypothesis' ? hypothesis.outcome.knowledgeId : '';
    expect(byId.get(newId)?.knowledgeType).toBe('HYPOTHESIS');

    // Players created only evidence, testimony and hypotheses; never a fact or a secret.
    const playerMade = [...state.knowledge.values()].filter(
      (record) => record.origin.actorId === 'player-elowen',
    );
    expect(new Set(playerMade.map((record) => record.knowledgeType))).toEqual(
      new Set(['TESTIMONY', 'EVIDENCE', 'HYPOTHESIS']),
    );
    expect(playerMade.every((record) => record.scope.kind === 'PARTY')).toBe(true);

    // Every record was assigned exactly once: nothing rewrites a record's type.
    const snapshot = await world.engine.load(CAMPAIGN);
    const assigned = (snapshot?.history ?? [])
      .filter((event) => event.type === 'KnowledgeAssigned')
      .map((event) => event.payload.knowledgeId);
    expect(new Set(assigned).size).toBe(assigned.length);

    // The party learned the evidence, but no secret, truth, or unasked testimony.
    const text = JSON.stringify(visible.knowledge);
    expect(PARTY_MUST_NOT_LEARN.filter((marker) => text.includes(marker))).toEqual([]);
    expect(
      visible.knowledge.some((view) => ['WORLD_TRUTH', 'DM', 'NPC'].includes(view.scope.kind)),
    ).toBe(false);
    expect(text).toContain('The spokes were sawn through cleanly, not smashed.');
    expect(text).not.toContain('The blade has never been used');
  });
});
