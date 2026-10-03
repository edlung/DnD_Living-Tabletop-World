import { describe, expect, it } from 'vitest';

import {
  DM,
  ELOWEN,
  codeOf,
  investigationWorld,
  CAMPAIGN,
} from '../investigation/testing/world.ts';
import { replay } from '../kernel/evolve.ts';
import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import { redecideEffective } from '../kernel/testing/redecide.ts';

/** Contradictions depend explicitly on their records, claims and party membership (ADR 0014 §2). */
async function afterThorne() {
  const world = await investigationWorld();
  await world.submit({ type: 'EnterLocation', characterId: ELOWEN, locationId: 'north-gate' });
  const asked = await world.submit({
    type: 'AskAbout',
    characterId: ELOWEN,
    npcId: 'captain-thorne',
    topicId: 'guild-caravan',
  });
  if (asked.status === 'rejected') throw new Error(asked.code);
  return { world, askedId: asked.commandId };
}

describe('undo', () => {
  it('removes the contradiction with the conversation that caused it', async () => {
    const { world, askedId } = await afterThorne();
    expect((await world.state()).epistemics.contradictions.size).toBe(1);
    expect(codeOf(await world.submit({ type: 'UndoCommand', targetCommandId: askedId }, DM))).toBe(
      'accepted',
    );
    const state = await world.state();
    expect(state.epistemics.contradictions.size).toBe(0);
    expect([...state.knowledge.values()].some((k) => k.knowledgeType === 'CONTRADICTION')).toBe(
      false,
    );
    expect(checkWorldIntegrity(state)).toEqual([]);
  });

  it('refuses to undo a claim or record a standing contradiction depends on', async () => {
    const { world } = await afterThorne();
    // The party's claim on Mira's account, and that account itself.
    for (const targetCommandId of ['ravenford.contradiction.0003', 'ravenford.knowledge.0029']) {
      const result = await world.submit({ type: 'UndoCommand', targetCommandId }, DM);
      expect(codeOf(result), targetCommandId).toBe('UNDO_UNSAFE');
    }
  });

  it('depends on party membership when it lives in a character reached through the party', async () => {
    const world = await investigationWorld();
    await world.submit(
      {
        type: 'AddKnowledge',
        knowledgeId: 'x-own',
        scope: { kind: 'CHARACTER', characterId: ELOWEN },
        knowledgeType: 'HYPOTHESIS',
        statement: 'It left at noon.',
        subjects: ['guild-caravan'],
        knownSince: null,
      },
      DM,
    );
    const claimed = await world.submit(
      {
        type: 'SetClaim',
        target: { kind: 'knowledge', knowledgeId: 'x-own' },
        claim: { subjectId: 'guild-caravan', aspect: 'departure-time', value: 'at-noon' },
      },
      DM,
    );
    const log = await world.engine.commandLog(CAMPAIGN);
    const assignment = log.find((stored) => stored.command.type === 'AssignCharacter');
    const result = await world.submit(
      { type: 'UndoCommand', targetCommandId: assignment?.commandId ?? '' },
      DM,
    );
    expect(result.status === 'rejected' && result.code).toBe('UNDO_UNSAFE');
    const blockers =
      result.status === 'rejected' ? (result.details?.['blockers'] as { commandId: string }[]) : [];
    expect(blockers.map((b) => b.commandId)).toContain(claimed.commandId);
  });
});

describe('re-detection after undo', () => {
  it('derives the same contradiction when the same command is re-decided under current canon', async () => {
    const world = await investigationWorld();
    const rumor = (knowledgeId: string) => ({
      type: 'AddKnowledge',
      knowledgeId,
      scope: { kind: 'PARTY' },
      knowledgeType: 'RUMOR',
      statement: 'It left at noon.',
      subjects: ['guild-caravan'],
      knownSince: null,
    });
    const claim = (knowledgeId: string) => ({
      type: 'SetClaim',
      target: { kind: 'knowledge', knowledgeId },
      claim: { subjectId: 'guild-caravan', aspect: 'departure-time', value: 'at-noon' },
    });
    await world.submit(rumor('x-noon'), DM);
    const first = await world.submit(claim('x-noon'), DM);
    if (first.status === 'rejected') throw new Error(first.code);
    expect(
      codeOf(await world.submit({ type: 'UndoCommand', targetCommandId: first.commandId }, DM)),
    ).toBe('accepted');
    expect(codeOf(await world.submit(claim('x-noon'), DM))).toBe('accepted');
    const snapshot = await world.engine.load(CAMPAIGN);
    if (!snapshot) throw new Error('missing campaign');
    expect(snapshot.state.epistemics.contradictions.size).toBe(1);
    const log = await world.engine.commandLog(CAMPAIGN);
    expect(redecideEffective(log, snapshot, () => 0)).toBeNull();
  });
});

describe('replay', () => {
  it('rebuilds claims and contradictions from history alone', async () => {
    const { world } = await afterThorne();
    const snapshot = await world.engine.load(CAMPAIGN);
    if (!snapshot) throw new Error('missing campaign');
    expect(replay(snapshot.history)).toEqual(snapshot.state);
    expect(checkWorldIntegrity(snapshot.state)).toEqual([]);
    expect(snapshot.history.filter((e) => e.type === 'ContradictionDetected')).toHaveLength(1);
  });
});
