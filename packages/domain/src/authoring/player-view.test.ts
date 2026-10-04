import { describe, expect, it } from 'vitest';

import { perceivedEntityIds } from '../investigation/perception.ts';
import { holderPerspective } from '../knowledge/perspective.ts';
import { knownEntityIds } from '../knowledge/projection.ts';
import { listKnowledge } from '../knowledge/queries.ts';
import type { WorldState } from '../kernel/state.ts';
import {
  ELOWEN,
  TESTIMONY,
  TOMAS,
  authoringWorld,
  codeOf,
  confirm,
  tomasProposal,
} from './testing/world.ts';

/**
 * What players see of an authored NPC (RAVENFORD_SPEC.md: "Player sees Tomas
 * as a native world NPC, not AI-generated content"; ADR 0018 §5). Authoring
 * leaves no trace in player views; Tomas's knowledge stays in his scope until
 * he shares it.
 */
const party = (state: WorldState) => holderPerspective(state, { kind: 'PARTY' });
const records = (state: WorldState, scope: Parameters<typeof holderPerspective>[1]) => {
  const listed = listKnowledge(state, holderPerspective(state, scope));
  if (!listed.ok) throw new Error(listed.reason);
  return listed.knowledge;
};

describe('an authored NPC in player views', () => {
  it('stays unknown to players and other NPCs until they meet him', async () => {
    const world = await authoringWorld();
    expect(codeOf(await world.commit(tomasProposal(), { confirmation: confirm('L2') }))).toBe(
      'accepted',
    );
    const state = await world.state();

    expect(knownEntityIds(state, party(state)).has(TOMAS)).toBe(false);
    expect(records(state, { kind: 'PARTY' }).some((view) => view.knowledgeId === TESTIMONY)).toBe(
      false,
    );
    expect(records(state, { kind: 'PUBLIC' }).some((view) => view.knowledgeId === TESTIMONY)).toBe(
      false,
    );
    expect(
      records(state, { kind: 'NPC', npcId: 'mira-vale' }).some(
        (view) => view.knowledgeId === TESTIMONY,
      ),
    ).toBe(false);
    expect(perceivedEntityIds(state, ELOWEN).has(TOMAS)).toBe(false);
  });

  it('is simply there at the North Gate, and his account reaches the party as testimony', async () => {
    const world = await authoringWorld();
    await world.commit(tomasProposal(), { confirmation: confirm('L2') });
    await world.submit({ type: 'EnterLocation', characterId: ELOWEN, locationId: 'north-gate' });
    expect(perceivedEntityIds(await world.state(), ELOWEN).has(TOMAS)).toBe(true);

    await world.submit({
      type: 'AskAbout',
      characterId: ELOWEN,
      npcId: TOMAS,
      topicId: 'guild-caravan',
    });
    const state = await world.state();
    const told = records(state, { kind: 'PARTY' }).filter(
      (view) => view.attributedTo?.entityId === TOMAS,
    );

    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({
      knowledgeType: 'TESTIMONY',
      attributedTo: { entityId: TOMAS, kind: 'npc', name: 'Tomas Reed' },
    });
    // No provenance (commands, actors, proposals) in a player view.
    expect(told[0]).not.toHaveProperty('origin');
    expect(JSON.stringify(told)).not.toMatch(/authoring|proposal|ApplyAuthoring|dm-ravenford/i);
  });
});
