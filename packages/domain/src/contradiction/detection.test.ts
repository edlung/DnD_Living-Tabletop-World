import type { CommandResult, KnowledgeScope } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  DM,
  ELOWEN,
  codeOf,
  investigationWorld,
  type InvestigationWorld,
} from '../investigation/testing/world.ts';
import { holderPerspective } from '../knowledge/perspective.ts';
import { visibleRecords } from '../knowledge/projection.ts';
import { listKnowledge } from '../knowledge/queries.ts';

/**
 * Contradiction detection (docs/adr/0014-contradictions-and-epistemic-integrity.md):
 * Mira and Thorne disagree, the engine says so neutrally in the one scope
 * that sees both accounts, and nothing else changes.
 */
const contradictions = async (world: InvestigationWorld) =>
  [...(await world.state()).knowledge.values()].filter(
    (record) => record.knowledgeType === 'CONTRADICTION',
  );

async function askThorne(world: InvestigationWorld): Promise<CommandResult> {
  await world.submit({ type: 'EnterLocation', characterId: ELOWEN, locationId: 'north-gate' });
  return world.submit({
    type: 'AskAbout',
    characterId: ELOWEN,
    npcId: 'captain-thorne',
    topicId: 'guild-caravan',
  });
}

async function dm(world: InvestigationWorld, command: Record<string, unknown>) {
  const result = await world.submit(command, DM);
  if (result.status === 'rejected') throw new Error(`${result.code}: ${result.message}`);
  return result;
}

const claim = (knowledgeId: string, value: string, aspect = 'departure-time') => ({
  type: 'SetClaim',
  target: { kind: 'knowledge', knowledgeId },
  claim: { subjectId: 'guild-caravan', aspect, value },
});

const record = (knowledgeId: string, scope: KnowledgeScope, knowledgeType = 'TESTIMONY') => ({
  type: 'AddKnowledge',
  knowledgeId,
  scope,
  knowledgeType,
  statement: `Statement ${knowledgeId}.`,
  subjects: ['guild-caravan'],
  ...(knowledgeType === 'TESTIMONY' ? { attributedTo: 'mira-vale' } : {}),
  knownSince: null,
});

describe('Mira and Thorne disagree about the departure', () => {
  it('records one neutral CONTRADICTION in the party scope when Thorne is asked', async () => {
    const world = await investigationWorld();
    expect(await contradictions(world)).toEqual([]);
    const asked = await askThorne(world);
    const [found, ...more] = await contradictions(world);
    expect(more).toEqual([]);
    const state = await world.state();
    const thorneCopy = [...state.knowledge.values()].find(
      (k) =>
        k.scope.kind === 'PARTY' &&
        k.attributedTo === 'captain-thorne' &&
        k.statement.includes('sunrise'),
    );
    expect(found).toMatchObject({
      scope: { kind: 'PARTY' },
      knowledgeType: 'CONTRADICTION',
      subjects: ['guild-caravan'],
      attributedTo: null,
      knownSince: state.clock,
    });
    expect(found?.relations.map((r) => r.type)).toEqual(['CONTRADICTS', 'CONTRADICTS']);
    expect(new Set(found?.relations.map((r) => r.knowledgeId))).toEqual(
      new Set(['party-mira-departure', thorneCopy?.knowledgeId]),
    );
    expect(found?.statement).toMatch(
      /^Conflicting accounts of Merchant Guild caravan: (Mira Vale and Captain Thorne|Captain Thorne and Mira Vale) disagree\.$/,
    );
    // The player's outcome lists what Thorne shared, never the engine's own records.
    expect(asked.status !== 'rejected' && asked.outcome).toEqual({
      kind: 'AskAbout',
      shared: expect.not.arrayContaining([found?.knowledgeId]) as unknown,
    });
  });

  it('changes no record: both accounts stay TESTIMONY, nobody is called a liar', async () => {
    const world = await investigationWorld();
    const before = await world.state();
    await askThorne(world);
    const after = await world.state();
    for (const [id, record] of before.knowledge) expect(after.knowledge.get(id)).toEqual(record);
    const created = [...after.knowledge.values()].filter(
      (k) => !before.knowledge.has(k.knowledgeId),
    );
    expect(created.map((k) => k.knowledgeType).sort()).toEqual([
      'CONTRADICTION',
      'TESTIMONY',
      'TESTIMONY',
    ]);
    expect(created.some((k) => /\b(lie|lied|liar|true|false|wrong)\b/i.test(k.statement))).toBe(
      false,
    );
  });

  it('says nothing about the claims: no aspect, no value, no quoted account', async () => {
    const world = await investigationWorld();
    await askThorne(world);
    const [found] = await contradictions(world);
    for (const word of ['departure', 'dawn', 'sunrise', 'before', 'after', '"']) {
      expect(found?.statement).not.toContain(word);
    }
  });

  it('keeps Mira and Thorne themselves unaware of each other', async () => {
    const world = await investigationWorld();
    await askThorne(world);
    const state = await world.state();
    for (const npcId of ['mira-vale', 'captain-thorne', 'orin-stonebeard']) {
      const view = holderPerspective(state, { kind: 'NPC', npcId });
      expect(
        visibleRecords(state, view).filter((k) => k.knowledgeType === 'CONTRADICTION'),
      ).toEqual([]);
    }
    const publicView = holderPerspective(state, { kind: 'PUBLIC' });
    expect(visibleRecords(state, publicView).some((k) => k.knowledgeType === 'CONTRADICTION')).toBe(
      false,
    );
    const elowen = holderPerspective(state, { kind: 'CHARACTER', characterId: ELOWEN });
    expect(
      visibleRecords(state, elowen).filter((k) => k.knowledgeType === 'CONTRADICTION'),
    ).toHaveLength(1);
  });

  it('is recorded once, however often the accounts are repeated', async () => {
    const world = await investigationWorld();
    await askThorne(world);
    expect(
      codeOf(
        await world.submit({
          type: 'AskAbout',
          characterId: ELOWEN,
          npcId: 'captain-thorne',
          topicId: 'guild-caravan',
        }),
      ),
    ).toBe('NO_EFFECT');
    expect(await contradictions(world)).toHaveLength(1);
  });

  it('did not exist before it was noticed', async () => {
    const world = await investigationWorld();
    const before = (await world.state()).clock;
    await dm(world, { type: 'AdvanceWorldTime', by: 600 });
    await askThorne(world);
    const state = await world.state();
    const party = holderPerspective(state, { kind: 'PARTY' });
    const earlier = listKnowledge(state, party, { asOf: before, knowledgeType: 'CONTRADICTION' });
    expect(earlier.ok && earlier.knowledge).toEqual([]);
  });
});

describe('which scope records a conflict', () => {
  it('records PUBLIC versus an NPC account only in that NPC', async () => {
    const world = await investigationWorld();
    await dm(world, record('x-public', { kind: 'PUBLIC' }, 'RUMOR'));
    await dm(world, claim('x-public', 'at-noon'));
    const [found] = await contradictions(world);
    expect(found?.scope).toEqual({ kind: 'NPC', npcId: 'mira-vale' });
    expect(new Set(found?.relations.map((r) => r.knowledgeId))).toEqual(
      new Set(['mira-departure', 'x-public']),
    );
    // It conflicts with every account each audience can see: Thorne's in his
    // scope, and the party's copy of Mira's in the party scope.
    expect((await contradictions(world)).map((k) => k.scope)).toEqual([
      { kind: 'NPC', npcId: 'mira-vale' },
      { kind: 'NPC', npcId: 'captain-thorne' },
      { kind: 'PARTY' },
    ]);
  });

  it('never joins two different holders, nor anything with the truth', async () => {
    const world = await investigationWorld();
    // Mira's and Thorne's own accounts conflict, but no non-DM holder sees both.
    expect(await contradictions(world)).toEqual([]);
    await dm(world, record('x-truth', { kind: 'WORLD_TRUTH' }, 'FACT'));
    expect(codeOf(await world.submit(claim('x-truth', 'at-noon'), DM))).toBe('INVALID_CLAIM');
  });

  it('records PARTY versus a party member’s own account in that character', async () => {
    const world = await investigationWorld();
    await dm(world, record('x-own', { kind: 'CHARACTER', characterId: ELOWEN }, 'HYPOTHESIS'));
    await dm(world, claim('x-own', 'at-noon'));
    const scopes = (await contradictions(world)).map((k) => k.scope);
    expect(scopes).toEqual([{ kind: 'CHARACTER', characterId: ELOWEN }]);
  });

  it('records every conflicting pair, but not agreements', async () => {
    const world = await investigationWorld();
    for (const [id, value] of [
      ['x-1', 'at-noon'],
      ['x-2', 'at-noon'],
      ['x-3', 'at-midnight'],
    ] as const) {
      await dm(world, record(id, { kind: 'PARTY' }, 'RUMOR'));
      await dm(world, claim(id, value));
    }
    const pairs = (await contradictions(world)).map((k) =>
      k.relations
        .map((r) => r.knowledgeId)
        .sort()
        .join('+'),
    );
    expect(pairs.sort()).toEqual(
      [
        'party-mira-departure+x-1',
        'party-mira-departure+x-2',
        'party-mira-departure+x-3',
        'x-1+x-3',
        'x-2+x-3',
      ].sort(),
    );
  });

  it('ignores claims about another subject or aspect', async () => {
    const world = await investigationWorld();
    await dm(world, record('x-route', { kind: 'PARTY' }, 'RUMOR'));
    await dm(world, claim('x-route', 'north-road', 'route'));
    expect(await contradictions(world)).toEqual([]);
  });
});

describe('evidence against a hypothesis', () => {
  it('flags the conflict and leaves the hypothesis a hypothesis', async () => {
    const world = await investigationWorld();
    await dm(world, {
      type: 'AddClue',
      clueId: 'x-clue',
      entityId: 'market-square',
      method: 'inspect',
      statement: 'Big boot prints near the stalls.',
      subjects: ['guild-caravan'],
    });
    await dm(world, {
      type: 'SetClaim',
      target: { kind: 'clue', clueId: 'x-clue' },
      claim: { subjectId: 'guild-caravan', aspect: 'attackers', value: 'not-only-goblins' },
    });
    await dm(world, claim('party-goblin-hypothesis', 'goblins', 'attackers'));
    const before = (await world.state()).knowledge.get('party-goblin-hypothesis');
    expect(await contradictions(world)).toEqual([]);

    await world.submit({
      type: 'ExamineEntity',
      characterId: ELOWEN,
      entityId: 'market-square',
      method: 'inspect',
    });
    const [found] = await contradictions(world);
    expect(found?.statement).toMatch(
      /^Conflicting accounts of Merchant Guild caravan: (the evidence and the hypothesis|the hypothesis and the evidence) disagree\.$/,
    );
    const after = (await world.state()).knowledge.get('party-goblin-hypothesis');
    expect(after).toEqual(before);
    expect(after?.knowledgeType).toBe('HYPOTHESIS');
  });
});

describe('one decision, several new claims', () => {
  it('records a conflict between two records revealed together exactly once', async () => {
    const world = await investigationWorld();
    for (const [clueId, value] of [
      ['x-clue-a', 'north'],
      ['x-clue-b', 'south'],
    ] as const) {
      await dm(world, {
        type: 'AddClue',
        clueId,
        entityId: 'market-square',
        method: 'inspect',
        statement: `Wheel ruts lead ${value}.`,
        subjects: ['guild-caravan'],
      });
      await dm(world, {
        type: 'SetClaim',
        target: { kind: 'clue', clueId },
        claim: { subjectId: 'guild-caravan', aspect: 'heading', value },
      });
    }
    await world.submit({
      type: 'ExamineEntity',
      characterId: ELOWEN,
      entityId: 'market-square',
      method: 'inspect',
    });
    const found = await contradictions(world);
    expect(found).toHaveLength(1);
    expect(found[0]?.statement).toBe(
      'Conflicting accounts of Merchant Guild caravan: the evidence said different things.',
    );
  });
});

describe('claims are DM data', () => {
  it('appear in DM views only', async () => {
    const world = await investigationWorld();
    await askThorne(world);
    const state = await world.state();
    const party = listKnowledge(state, holderPerspective(state, { kind: 'PARTY' }));
    const text = JSON.stringify(party);
    for (const leak of ['claim', 'departure-time', 'before-dawn', 'after-sunrise']) {
      expect(text).not.toContain(leak);
    }
    const dmView = listKnowledge(state, { label: 'DM', kind: 'DM', holderId: null, scopes: 'ALL' });
    const mira = dmView.ok
      ? dmView.knowledge.find((k) => k.knowledgeId === 'party-mira-departure')
      : null;
    expect(mira?.claim).toEqual({
      subjectId: 'guild-caravan',
      aspect: 'departure-time',
      value: 'before-dawn',
    });
  });
});
