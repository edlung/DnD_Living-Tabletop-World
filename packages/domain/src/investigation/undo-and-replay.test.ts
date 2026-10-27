import type { CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { parseRecordedEvent } from '../kernel/events.ts';
import { replay } from '../kernel/evolve.ts';
import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import { CAMPAIGN, DM, ELOWEN, codeOf, investigationWorld } from './testing/world.ts';

/** Investigation events obey ADR 0006 undo and replay without re-rolling (ADR 0013). */
const commandIdOf = (result: CommandResult) => {
  if (result.status === 'rejected') throw new Error(result.code);
  return result.commandId;
};

async function examinedWeapon() {
  const world = await investigationWorld();
  for (const locationId of ['old-trade-road', 'location-f3b82c8b']) {
    await world.submit({ type: 'EnterLocation', characterId: ELOWEN, locationId });
  }
  world.roll(12);
  const examined = await world.submit({
    type: 'ExamineEntity',
    characterId: ELOWEN,
    entityId: 'item-0869f47a',
    method: 'investigation',
  });
  return { world, examinedId: commandIdOf(examined) };
}

describe('undo', () => {
  it('undoes an examination: the attempt, the revealed clue, the record and the memory', async () => {
    const { world, examinedId } = await examinedWeapon();
    const before = await world.state();
    expect(before.investigation.attempts.size).toBe(1);
    expect(
      codeOf(await world.submit({ type: 'UndoCommand', targetCommandId: examinedId }, DM)),
    ).toBe('accepted');
    const after = await world.state();
    expect(after.investigation.attempts.size).toBe(0);
    expect(after.investigation.revealed.size).toBe(0);
    expect(after.knowledge.size).toBe(before.knowledge.size - 1);
    expect(after.memories.size).toBe(before.memories.size - 1);
    expect(checkWorldIntegrity(after)).toEqual([]);
  });

  it('blocks undoing a clue that an examination revealed', async () => {
    const { world } = await examinedWeapon();
    const log = await world.engine.commandLog(CAMPAIGN);
    const addClue = log.find(
      (stored) =>
        stored.command.type === 'AddClue' && stored.command.clueId === 'clue-blade-unused',
    );
    const result = await world.submit(
      { type: 'UndoCommand', targetCommandId: addClue?.commandId ?? '' },
      DM,
    );
    expect(codeOf(result)).toBe('UNDO_UNSAFE');
  });

  it('undoes sharing and disclosure policy', async () => {
    const world = await investigationWorld();
    const asked = await world.submit({
      type: 'AskAbout',
      characterId: ELOWEN,
      npcId: 'mira-vale',
      topicId: 'guild-caravan',
    });
    await world.submit({ type: 'UndoCommand', targetCommandId: commandIdOf(asked) }, DM);
    expect((await world.state()).investigation.shared.size).toBe(0);
    const policy = await world.submit(
      { type: 'SetDisclosure', knowledgeId: 'thorne-missing-patrol', disclosure: 'WILLING' },
      DM,
    );
    await world.submit({ type: 'UndoCommand', targetCommandId: commandIdOf(policy) }, DM);
    expect((await world.state()).investigation.disclosures.get('thorne-missing-patrol')).toBe(
      undefined,
    );
  });
});

describe('undo of an examination that changed nothing', () => {
  // Regressions: Stage 70 (an empty CommandUndone must still parse after a reload)
  // and Gate 02 G02-M01 (such an undo must be accepted, or the command would hold
  // its read dependencies forever).
  it('is accepted with an empty compensation, and the history still parses', async () => {
    const world = await investigationWorld();
    const inspected = await world.submit({
      type: 'ExamineEntity',
      characterId: ELOWEN,
      entityId: 'mira-vale',
      method: 'inspect',
    });
    const result = await world.submit(
      { type: 'UndoCommand', targetCommandId: commandIdOf(inspected) },
      DM,
    );
    expect(codeOf(result)).toBe('accepted');
    const snapshot = await world.engine.load(CAMPAIGN);
    const compensation = snapshot?.history.at(-1);
    expect(compensation?.type === 'CommandUndone' && compensation.payload.restores).toEqual([]);
    expect(snapshot?.state.commands.get(commandIdOf(inspected))?.undoneBy).not.toBeNull();
    const serialized = JSON.parse(JSON.stringify(snapshot?.history)) as unknown[];
    expect(replay(serialized.map(parseRecordedEvent))).toEqual(snapshot?.state);
  });
});

describe('replay', () => {
  it('rebuilds the same state from history without drawing any dice', async () => {
    const { world } = await examinedWeapon();
    const snapshot = await world.engine.load(CAMPAIGN);
    if (!snapshot) throw new Error('missing campaign');
    expect(replay(snapshot.history)).toEqual(snapshot.state);
    const examined = snapshot.history.find((event) => event.type === 'EvidenceExamined');
    expect(examined?.payload).toMatchObject({ roll: { d20: 12, modifier: 8, total: 20 } });
  });

  it('records the resolution with the command; a retried command ID never rolls again', async () => {
    const { world, examinedId } = await examinedWeapon();
    const log = await world.engine.commandLog(CAMPAIGN);
    const stored = log.find((c) => c.commandId === examinedId);
    expect(stored?.command).toMatchObject({ resolution: { d20: 12 } });
    const retried = await world.engine.execute({
      commandId: examinedId,
      campaignId: CAMPAIGN,
      actor: stored?.actor,
      command: {
        type: 'ExamineEntity',
        characterId: ELOWEN,
        entityId: 'item-0869f47a',
        method: 'investigation',
      },
    });
    expect(retried).toMatchObject({
      status: 'duplicate',
      outcome: { kind: 'ExamineEntity', roll: { d20: 12, modifier: 8, total: 20 } },
    });
  });
});
