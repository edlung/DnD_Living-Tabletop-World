import type { CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { redecideEffective } from '../kernel/verification/redecide.ts';
import { holderPerspective } from '../knowledge/perspective.ts';
import { visibleRecords } from '../knowledge/projection.ts';
import { INSIGHT_DC } from './insight.ts';
import {
  CAMPAIGN,
  DM,
  ELOWEN,
  MODIFIERS,
  codeOf,
  investigationWorld,
  type InvestigationWorld,
} from './testing/world.ts';

/**
 * Insight (docs/adr/0020-npc-intelligence.md §4, owner decision): a Wisdom
 * (Insight) check at DC 13, once per character and NPC. Success on an NPC
 * holding something back about a known topic yields an INFERENCE for the
 * party; a failure and nothing to sense look alike.
 */
const check = (world: InvestigationWorld, npcId: string, topicId: string) =>
  world.submit({ type: 'InsightCheck', characterId: ELOWEN, npcId, topicId });

const outcomeOf = (result: CommandResult) =>
  result.status === 'accepted' && result.outcome?.kind === 'InsightCheck' ? result.outcome : null;

async function inferences(world: InvestigationWorld) {
  const state = await world.state();
  return visibleRecords(state, holderPerspective(state, { kind: 'PARTY' }))
    .filter((record) => record.knowledgeType === 'INFERENCE')
    .map((record) => record.statement);
}

describe('InsightCheck', () => {
  it('senses that Mira is holding back her account of the departure', async () => {
    const world = await investigationWorld();
    world.roll(15);
    const result = await check(world, 'mira-vale', 'guild-caravan');
    const outcome = outcomeOf(result);

    expect(outcome?.roll).toEqual({ d20: 15, modifier: 0, total: 15 });
    expect(outcome?.inferred).toHaveLength(1);
    expect(await inferences(world)).toEqual([
      'Mira Vale seems to be holding something back about Merchant Guild caravan.',
    ]);
  });

  it('is one attempt per character and NPC', async () => {
    const world = await investigationWorld();
    // The die is drawn at resolution, before the decision refuses the repeat.
    world.roll(15, 15);
    await check(world, 'mira-vale', 'guild-caravan');
    expect(codeOf(await check(world, 'mira-vale', 'market-square'))).toBe('ALREADY_ATTEMPTED');
  });

  it('looks the same on a failure and on nothing to sense', async () => {
    const failed = await investigationWorld();
    failed.roll(INSIGHT_DC - 1);
    const nothing = await investigationWorld();
    nothing.roll(20);
    const low = await check(failed, 'mira-vale', 'guild-caravan');
    const empty = await check(nothing, 'mira-vale', 'ravenford');

    expect(outcomeOf(low)?.inferred).toEqual([]);
    expect(outcomeOf(empty)?.inferred).toEqual([]);
    const types = (result: CommandResult) =>
      result.status === 'accepted' ? result.events.map((event) => event.type) : [];
    expect(types(low)).toEqual(types(empty));
    expect(await inferences(failed)).toEqual([]);
  });

  it('needs a topic the character knows and the NPC here', async () => {
    const world = await investigationWorld();
    world.roll(15, 15);
    expect(codeOf(await check(world, 'mira-vale', '3f9c2b7e-5a1d-4e8f-9b06-7c4d2e1a8f53'))).toBe(
      'ENTITY_NOT_FOUND',
    );
    expect(codeOf(await check(world, 'orin-stonebeard', 'guild-caravan'))).toBe('NOT_PRESENT');
  });

  it('keeps undo exact, including the names its inference quotes', async () => {
    const world = await investigationWorld();
    const renamed = await world.submit(
      { type: 'UpdateEntityProfile', entityId: 'mira-vale', name: 'Mira of the Market' },
      DM,
    );
    world.roll(15);
    await check(world, 'mira-vale', 'guild-caravan');
    expect(await inferences(world)).toEqual([
      'Mira of the Market seems to be holding something back about Merchant Guild caravan.',
    ]);

    const undone = await world.submit(
      { type: 'UndoCommand', targetCommandId: renamed.commandId ?? '' },
      DM,
    );
    expect(codeOf(undone)).toBe('UNDO_UNSAFE');
    const snapshot = await world.engine.load(CAMPAIGN);
    if (!snapshot) throw new Error('missing campaign');
    const log = await world.engine.commandLog(CAMPAIGN);
    expect(redecideEffective(log, snapshot, (_sheet, skill) => MODIFIERS[skill] ?? 0)).toBeNull();
  });
});
