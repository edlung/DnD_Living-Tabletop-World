import { questBookSchema, questDefinitionSchema } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import questBook from '../../../../fixtures/ravenford/quests.json' with { type: 'json' };
import { ELOWEN, PLAYER } from '../authoring/testing/world.ts';
import { chronicleWorld } from '../chronicle/testing/world.ts';
import { holderPerspective } from '../knowledge/perspective.ts';
import { DM_VIEW } from '../visual/testing/world.ts';
import { questLog } from './projection.ts';

/**
 * The Missing Caravan quest projection (ADR 0025 §2; owner decisions of
 * 2026-10-04): activated by the party's own record or memory about the
 * caravan, advanced by its own history, read by the party, its members, and
 * the DM, stored nowhere.
 */
const QUESTS = questBookSchema.parse(questBook).quests;

async function questOf(
  world: Awaited<ReturnType<typeof chronicleWorld>>,
  view?: 'DM' | 'CHARACTER' | 'PUBLIC',
) {
  const snapshot = await world.snapshot();
  const perspective =
    view === 'DM'
      ? DM_VIEW
      : view === 'CHARACTER'
        ? holderPerspective(snapshot.state, { kind: 'CHARACTER', characterId: ELOWEN })
        : view === 'PUBLIC'
          ? holderPerspective(snapshot.state, { kind: 'PUBLIC' })
          : holderPerspective(snapshot.state, { kind: 'PARTY' });
  return questLog(snapshot, perspective, QUESTS);
}

const stages = (log: Awaited<ReturnType<typeof questOf>>) =>
  log[0]?.transitions.map((transition) => transition.stage) ?? [];

describe('the Missing Caravan', () => {
  it('activates on Mira’s account to the party, not on the public rumor', async () => {
    const world = await chronicleWorld();
    const [quest] = await questOf(world);
    expect(quest?.transitions[0]).toMatchObject({
      type: 'QuestActivated',
      stage: 'activated',
      worldTime: 34_200,
      sources: [{ eventType: 'KnowledgeAssigned' }],
    });
    // The overdue-caravan rumor is public from Day 1 06:00; it activates nothing.
    const rumor = (await world.state()).knowledge.get('pub-caravan-overdue');
    expect(rumor?.knownSince).toBe(21_600);
    expect(quest?.transitions.every((t) => t.worldTime >= 34_200)).toBe(true);
    // The goblin theory is the party's own hypothesis.
    expect(stages(await questOf(world))).toEqual(['activated', 'hypothesis-formed']);
  });

  it('advances with the party’s own steps, and loses them when they are undone', async () => {
    const world = await chronicleWorld();
    await world.enter('old-trade-road');
    const entered = await world.as(PLAYER, {
      type: 'EnterLocation',
      characterId: ELOWEN,
      locationId: 'location-f3b82c8b',
    });
    await world.as(PLAYER, {
      type: 'ExamineEntity',
      characterId: ELOWEN,
      entityId: 'feature-19c7c7f7',
      method: 'inspect',
    });
    expect(stages(await questOf(world))).toEqual([
      'activated',
      'hypothesis-formed',
      'site-reached',
      'evidence-examined',
    ]);
    // Undo the examination, then the arrival: the quest follows the history in effect.
    const log = await world.engine.commandLog('ravenford');
    const examined = log.find((stored) => stored.commandType === 'ExamineEntity')?.commandId ?? '';
    expect((await world.undo(examined)).status).toBe('accepted');
    expect((await world.undo(entered.commandId ?? '')).status).toBe('accepted');
    expect(stages(await questOf(world))).toEqual(['activated', 'hypothesis-formed']);
    await world.verified();
  });

  it('ignores what only one character holds, so the party learns nothing private', async () => {
    const world = await chronicleWorld();
    await world.as(PLAYER, {
      type: 'FormHypothesis',
      characterId: ELOWEN,
      scope: 'CHARACTER',
      statement: 'Someone wanted it to look like goblins.',
      subjects: ['guild-caravan'],
    });
    const [quest] = await questOf(world);
    expect(quest?.transitions.filter((t) => t.stage === 'hypothesis-formed')).toHaveLength(1);
    expect(quest?.transitions.find((t) => t.stage === 'hypothesis-formed')?.worldTime).toBe(35_100);
  });

  it('is read by the party, its members, and the DM, and by nobody else', async () => {
    const world = await chronicleWorld();
    const party = await questOf(world);
    expect(await questOf(world, 'CHARACTER')).toEqual(party);
    expect(await questOf(world, 'PUBLIC')).toEqual([]);
    const snapshot = await world.snapshot();
    expect(
      questLog(
        snapshot,
        holderPerspective(snapshot.state, { kind: 'NPC', npcId: 'mira-vale' }),
        QUESTS,
      ),
    ).toEqual([]);
    const [dm] = await questOf(world, 'DM');
    expect(dm?.transitions[0]?.sources[0]?.sequence).toEqual(expect.any(Number));
    expect(party[0]?.transitions[0]?.sources[0]?.sequence).toBeUndefined();
  });

  it('is a projection: nothing in the world records it, and reading it changes nothing', async () => {
    const world = await chronicleWorld();
    const before = await world.snapshot();
    await questOf(world);
    await questOf(world, 'DM');
    const after = await world.snapshot();
    expect(after.state).toBe(before.state);
    expect(Object.keys(after.state).some((key) => /quest/i.test(key))).toBe(false);
    expect(after.history.some((event) => /^Quest/.test(event.type))).toBe(false);
  });
});

describe('a quest completed by telling an NPC (Stage 530)', () => {
  const TOLD = questDefinitionSchema.parse({
    questId: 'told',
    title: 'Told',
    activation: { subject: 'guild-caravan', summary: 'We learned of the caravan.' },
    milestones: [
      {
        stage: 'mira-told',
        kind: 'shown-to',
        npcId: 'mira-vale',
        subject: 'guild-caravan',
        summary: 'We told Mira.',
      },
    ],
    completion: 'mira-told',
  });

  it('completes when a member shows the party’s own evidence, never a private record', async () => {
    const world = await chronicleWorld();
    const add = async (statement: string, scope: Record<string, unknown>) => {
      await world.dm({
        type: 'AddKnowledge',
        scope,
        knowledgeType: 'EVIDENCE',
        statement,
        subjects: ['guild-caravan'],
        knownSince: null,
      });
      const records = [...(await world.state()).knowledge.values()];
      return records.find((record) => record.statement === statement)?.knowledgeId ?? '';
    };
    const own = await add('Elowen alone saw the burned wagons.', {
      kind: 'CHARACTER',
      characterId: ELOWEN,
    });
    const shared = await add('The party found the burned wagons.', { kind: 'PARTY' });
    const show = (knowledgeId: string) =>
      world.as(PLAYER, {
        type: 'ShowEvidence',
        characterId: ELOWEN,
        npcId: 'mira-vale',
        knowledgeId,
      });
    const log = async () => {
      const snapshot = await world.snapshot();
      return questLog(snapshot, holderPerspective(snapshot.state, { kind: 'PARTY' }), [TOLD]);
    };
    expect((await show(own)).status).toBe('accepted');
    expect((await log())[0]?.status).toBe('active');
    expect((await show(shared)).status).toBe('accepted');
    const [quest] = await log();
    expect(quest?.status).toBe('completed');
    expect(quest?.transitions.at(-1)).toMatchObject({
      type: 'QuestCompleted',
      stage: 'mira-told',
      sources: [{ eventType: 'EvidenceShown' }],
    });
  });
});
