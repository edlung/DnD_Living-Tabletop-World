import { describe, expect, it } from 'vitest';

import {
  CAMPAIGN,
  DM,
  ELOWEN,
  MODIFIERS,
  codeOf,
  investigationWorld,
} from '../investigation/testing/world.ts';
import { redecideEffective } from '../kernel/verification/redecide.ts';

/**
 * A contradiction's neutral statement quotes names (ADR 0014 §2), so it rests
 * on them: undoing a rename it quoted is refused while it stands. Found by
 * the Stage 120 randomized authoring test, where a rename was undone beneath
 * a contradiction and re-deciding it gave another statement.
 */
describe('names a contradiction quotes', () => {
  it('cannot be undone beneath it, and re-deciding stays exact', async () => {
    const world = await investigationWorld();
    const renamed = await world.submit(
      { type: 'UpdateEntityProfile', entityId: 'captain-thorne', name: 'Captain Blackwood' },
      DM,
    );
    await world.submit({ type: 'EnterLocation', characterId: ELOWEN, locationId: 'north-gate' });
    const asked = await world.submit({
      type: 'AskAbout',
      characterId: ELOWEN,
      npcId: 'captain-thorne',
      topicId: 'guild-caravan',
    });
    expect(codeOf(asked)).toBe('accepted');

    const snapshot = await world.engine.load(CAMPAIGN);
    const detected = snapshot?.history.find((event) => event.type === 'ContradictionDetected');
    expect(detected?.payload).toMatchObject({
      named: ['guild-caravan', 'captain-thorne', 'mira-vale'],
    });
    const record = [...(snapshot?.state.knowledge.values() ?? [])].find(
      (knowledge) => knowledge.knowledgeType === 'CONTRADICTION',
    );
    expect(record?.statement).toContain('Captain Blackwood');

    const undone = await world.submit(
      { type: 'UndoCommand', targetCommandId: renamed.commandId ?? '' },
      DM,
    );
    expect(codeOf(undone)).toBe('UNDO_UNSAFE');
    const after = await world.engine.load(CAMPAIGN);
    if (!after) throw new Error('missing campaign');
    const log = await world.engine.commandLog(CAMPAIGN);
    expect(redecideEffective(log, after, (_sheet, skill) => MODIFIERS[skill] ?? 0)).toBeNull();
  });
});
