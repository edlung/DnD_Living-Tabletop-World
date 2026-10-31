import type { CommandResult, ContextAction } from '@ltw/contracts';
import { checkTalk, type WorldState } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { entityContext } from './entity-context.ts';
import {
  DM,
  ELOWEN,
  PLAYER,
  elowenView,
  seedRavenford,
  type SeededWorld,
} from './testing/ravenford.ts';

/**
 * Context legality and World Engine acceptance agree (docs/adr/0013-investigation.md §1,
 * docs/adr/0020-npc-intelligence.md §1): every executable context action is
 * tried as a command, compared, then undone. `AskAbout` may be NO_EFFECT when
 * nothing is shared: that outcome is hidden from context on purpose, so it
 * counts as "legal". Talk runs no command: it must match the dialogue's own
 * check (`checkTalk`). Insight is tried on a topic the character knows.
 */
const EXECUTABLE: Partial<
  Record<ContextAction['id'], (entityId: string, action: ContextAction) => Record<string, unknown>>
> = {
  take_item: (itemId) => ({ type: 'TakeItem', characterId: ELOWEN, itemId }),
  enter_location: (locationId) => ({ type: 'EnterLocation', characterId: ELOWEN, locationId }),
  inspect: (entityId) => ({
    type: 'ExamineEntity',
    characterId: ELOWEN,
    entityId,
    method: 'inspect',
  }),
  investigation_check: (entityId) => ({
    type: 'ExamineEntity',
    characterId: ELOWEN,
    entityId,
    method: 'investigation',
  }),
  perception_check: (entityId) => ({
    type: 'ExamineEntity',
    characterId: ELOWEN,
    entityId,
    method: 'perception',
  }),
  ask_about: (npcId, action) => ({
    type: 'AskAbout',
    characterId: ELOWEN,
    npcId,
    topicId: action.topic?.entityId,
  }),
  show_evidence: (npcId, action) => ({
    type: 'ShowEvidence',
    characterId: ELOWEN,
    npcId,
    knowledgeId: action.evidence?.knowledgeId,
  }),
  insight_check: (npcId) => ({
    type: 'InsightCheck',
    characterId: ELOWEN,
    npcId,
    topicId: 'ravenford',
  }),
};

const acceptedOrHidden = (result: CommandResult, id: string) =>
  result.status !== 'rejected' || (id === 'ask_about' && result.code === 'NO_EFFECT');

async function compareAll(world: SeededWorld, state: WorldState) {
  const view = elowenView(state);
  let compared = 0;
  for (const entityId of state.entities.keys()) {
    const result = entityContext(state, view, entityId);
    if (!result.ok) continue;
    for (const action of result.context.actions) {
      if (action.id === 'talk') {
        expect(checkTalk(state, PLAYER, ELOWEN, entityId).ok, `talk ${entityId}`).toBe(
          action.legal,
        );
        compared += 1;
        continue;
      }
      const build = EXECUTABLE[action.id];
      if (!build) continue;
      world.roll(10);
      const outcome = await world.submit(build(entityId, action));
      expect(
        acceptedOrHidden(outcome, action.id),
        `${action.id} ${entityId} ${JSON.stringify(outcome)}`,
      ).toBe(action.legal);
      if (outcome.status === 'accepted') {
        const undo = await world.submit(
          { type: 'UndoCommand', targetCommandId: outcome.commandId },
          DM,
        );
        // An inspection that found nothing changed nothing, so there is nothing to undo.
        const undone =
          undo.status === 'accepted' || (undo.status === 'rejected' && undo.code === 'NO_EFFECT');
        expect(undone, JSON.stringify(undo)).toBe(true);
      }
      compared += 1;
    }
  }
  return compared;
}

describe('context legality matches command acceptance', () => {
  it('in Market Square', async () => {
    const world = await seedRavenford();
    expect(await compareAll(world, world.state)).toBeGreaterThan(20);
  });

  it('at the caravan site, after some checks were attempted', async () => {
    const world = await seedRavenford();
    await world.submit({
      type: 'EnterLocation',
      characterId: ELOWEN,
      locationId: 'old-trade-road',
    });
    await world.submit({
      type: 'EnterLocation',
      characterId: ELOWEN,
      locationId: 'location-f3b82c8b',
    });
    world.roll(15);
    await world.submit({
      type: 'ExamineEntity',
      characterId: ELOWEN,
      entityId: 'item-0869f47a',
      method: 'investigation',
    });
    const state = await world.current();
    const blade = entityContext(state, elowenView(state), 'item-0869f47a');
    expect(
      blade.ok && blade.context.actions.find((a) => a.id === 'investigation_check'),
    ).toMatchObject({
      legal: false,
      reason: 'ALREADY_ATTEMPTED',
    });
    expect(await compareAll(world, state)).toBeGreaterThan(20);
  });

  it('in Orin’s shop, with evidence to show, after showing it and reading him', async () => {
    const world = await seedRavenford();
    await world.apply({
      type: 'AddKnowledge',
      knowledgeId: 'party-symbol-evidence',
      scope: { kind: 'PARTY' },
      knowledgeType: 'EVIDENCE',
      statement: 'A strange symbol is burned into a wagon plank.',
      subjects: ['feature-19c7c7f7'],
      knownSince: null,
    });
    // Evidence everyone knows is no one's to show.
    await world.apply({
      type: 'AddKnowledge',
      knowledgeId: 'public-symbol-evidence',
      scope: { kind: 'PUBLIC' },
      knowledgeType: 'EVIDENCE',
      statement: 'Everyone has seen the symbol on the notice board.',
      subjects: ['feature-19c7c7f7'],
      knownSince: null,
    });
    await world.submit({ type: 'EnterLocation', characterId: ELOWEN, locationId: 'orins-alchemy' });
    const before = await world.current();
    const orin = entityContext(before, elowenView(before), 'orin-stonebeard');
    const shows = orin.ok ? orin.context.actions.filter((a) => a.id === 'show_evidence') : [];
    expect(shows).toEqual([
      {
        id: 'show_evidence',
        evidence: { knowledgeId: 'party-symbol-evidence' },
        legal: true,
        relevance: 'medium',
      },
    ]);
    expect(await compareAll(world, before)).toBeGreaterThan(10);

    await world.submit({
      type: 'ShowEvidence',
      characterId: ELOWEN,
      npcId: 'orin-stonebeard',
      knowledgeId: 'party-symbol-evidence',
    });
    world.roll(10);
    await world.submit({
      type: 'InsightCheck',
      characterId: ELOWEN,
      npcId: 'orin-stonebeard',
      topicId: 'ravenford',
    });
    const after = await world.current();
    const shown = entityContext(after, elowenView(after), 'orin-stonebeard');
    const byId = (id: string, topic?: string) =>
      shown.ok
        ? shown.context.actions.find((a) => a.id === id && (!topic || a.topic?.entityId === topic))
        : undefined;
    // Shown the symbol, "ask about the symbol" surfaces (RAVENFORD_SPEC, the Orin scene).
    expect(byId('ask_about', 'feature-19c7c7f7')).toMatchObject({ legal: true, relevance: 'high' });
    expect(byId('insight_check')).toMatchObject({ legal: false, reason: 'ALREADY_ATTEMPTED' });
    expect(byId('show_evidence')).toMatchObject({ legal: true, relevance: 'low' });
    expect(byId('trade')).toMatchObject({ legal: false, reason: 'NOT_AVAILABLE' });
    expect(await compareAll(world, after)).toBeGreaterThan(10);
  });

  it('when the character is dead or Incapacitated', async () => {
    const world = await seedRavenford();
    const sheet = world.state.characterSheets.get(ELOWEN);
    await world.apply({
      type: 'SetCharacterSheet',
      entityId: ELOWEN,
      sheet: { ...sheet, conditions: ['incapacitated'] },
    });
    expect(await compareAll(world, await world.current())).toBeGreaterThan(10);
    await world.apply({ type: 'ChangeEntityStatus', entityId: ELOWEN, status: 'dead' });
    expect(await compareAll(world, await world.current())).toBeGreaterThan(10);
  });
});
