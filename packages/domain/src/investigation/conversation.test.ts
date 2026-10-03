import type { CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { DM, ELOWEN, codeOf, investigationWorld } from './testing/world.ts';

/** AskAbout (ADR 0013 §3): WILLING records only, as attributed testimony. */
const ask = (npcId: string, topicId: string) => ({
  type: 'AskAbout',
  characterId: ELOWEN,
  npcId,
  topicId,
});
const sharedIds = (result: CommandResult) =>
  result.status !== 'rejected' && result.outcome?.kind === 'AskAbout' ? result.outcome.shared : [];

describe('asking Mira about the caravan', () => {
  it('shares her willing record as testimony attributed to her, with DM-only provenance', async () => {
    const world = await investigationWorld();
    const result = await world.submit(ask('mira-vale', 'guild-caravan'));
    const [id] = sharedIds(result);
    const state = await world.state();
    expect(state.knowledge.get(id ?? '')).toMatchObject({
      scope: { kind: 'PARTY' },
      knowledgeType: 'TESTIMONY',
      attributedTo: 'mira-vale',
      subjects: ['guild-caravan', 'merchant-guild-faction', 'old-trade-road'],
      relations: [],
    });
    expect(sharedIds(result)).toHaveLength(1);
    expect(result.status !== 'rejected' && result.events.map((e) => e.type)).toEqual([
      'KnowledgeAssigned',
      'InformationShared',
      'MemoryRecorded',
    ]);
    const memory = [...state.memories.values()].at(-1);
    expect(memory).toMatchObject({
      memoryKind: 'CONVERSATION',
      scope: { kind: 'PARTY' },
      participants: [ELOWEN, 'mira-vale'],
      summary: 'Mira Vale told Elowen Starwhisper about Merchant Guild caravan.',
    });
  });

  it('tells each record once; asking about another topic shares only what is new', async () => {
    const world = await investigationWorld();
    await world.submit(ask('mira-vale', 'guild-caravan'));
    expect(codeOf(await world.submit(ask('mira-vale', 'guild-caravan')))).toBe('NO_EFFECT');
    const road = await world.submit(ask('mira-vale', 'old-trade-road'));
    const state = await world.state();
    expect(sharedIds(road).map((id) => state.knowledge.get(id)?.statement)).toEqual([
      state.knowledge.get('mira-prior-incident')?.statement,
    ]);
  });
});

describe('what cannot be learned by asking', () => {
  it('makes guarded, unknown and exhausted topics indistinguishable', async () => {
    const world = await investigationWorld();
    await world.submit(
      { type: 'PlaceEntity', entityId: 'orin-stonebeard', locationId: 'market-square' },
      DM,
    );
    const results = [
      await world.submit(ask('orin-stonebeard', 'captain-thorne')), // guarded FACT
      await world.submit(ask('orin-stonebeard', 'golden-stag-inn')), // knows nothing
      await world.submit(ask('mira-vale', 'golden-stag-inn')), // knows nothing
    ].map((r) => (r.status === 'rejected' ? [r.code, r.message, r.details] : r.status));
    expect(results).toEqual(Array(3).fill(['NO_EFFECT', 'Nothing new to share', undefined]));
  });

  it('refuses topics the character does not know exactly like nonexistent ones', async () => {
    const world = await investigationWorld();
    const results = [
      await world.submit(ask('mira-vale', 'strange-symbol')),
      await world.submit(ask('mira-vale', '3f9c2b7e-5a1d-4e8f-9b06-7c4d2e1a8f53')),
      await world.submit(ask('mira-vale', 'no-such-entity')),
      await world.submit(ask('no-such-npc', 'guild-caravan')),
    ].map((r) => (r.status === 'rejected' ? [r.code, r.message] : r.status));
    expect(results).toEqual(Array(4).fill(['ENTITY_NOT_FOUND', 'Not found']));
  });

  it('needs the NPC here and alive, and a capable character', async () => {
    const world = await investigationWorld();
    expect(codeOf(await world.submit(ask('captain-thorne', 'guild-caravan')))).toBe('NOT_PRESENT');
    await world.submit(
      { type: 'ChangeEntityStatus', entityId: 'captain-thorne', status: 'dead' },
      DM,
    );
    expect(codeOf(await world.submit(ask('captain-thorne', 'guild-caravan')))).toBe('NOT_PRESENT');
    await world.submit({ type: 'ChangeEntityStatus', entityId: 'mira-vale', status: 'dead' }, DM);
    expect(codeOf(await world.submit(ask('mira-vale', 'guild-caravan')))).toBe('TARGET_DEAD');
  });

  it('never shares SECRET records, even when the topic matches', async () => {
    const world = await investigationWorld();
    await world.submit(
      { type: 'PlaceEntity', entityId: 'orin-stonebeard', locationId: 'market-square' },
      DM,
    );
    await world.submit(
      {
        type: 'AddKnowledge',
        scope: { kind: 'PARTY' },
        knowledgeType: 'RUMOR',
        statement: 'A symbol was seen.',
        subjects: ['strange-symbol'],
        knownSince: null,
      },
      DM,
    );
    expect(codeOf(await world.submit(ask('orin-stonebeard', 'strange-symbol')))).toBe('NO_EFFECT');
  });
});
