import type { CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { MODIFIERS } from '../investigation/testing/world.ts';
import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import { redecideEffective } from '../kernel/verification/redecide.ts';
import { holderPerspective } from '../knowledge/perspective.ts';
import { visibleRecords } from '../knowledge/projection.ts';
import {
  CAMPAIGN,
  DM,
  ELOWEN,
  TESTIMONY,
  TOMAS,
  authoringWorld,
  codeOf,
  confirm,
  tomas,
  tomasProposal,
  type AuthoringWorld,
} from './testing/world.ts';

/**
 * The safe Tomas undo path (ADR 0006 §9; owner decision: explicit blockers,
 * docs/adr/0018-ai-authoring.md §7). An authoring commit comes off as one
 * unit; while anything depends on it, undo names the dependents, and the DM
 * undoes them explicitly first. History is never erased.
 */
const undo = (world: AuthoringWorld, targetCommandId: string, commandId: string) =>
  world.engine.execute({
    commandId,
    campaignId: CAMPAIGN,
    actor: DM,
    command: { type: 'UndoCommand', targetCommandId },
  });

const blockersOf = (result: CommandResult) =>
  result.status === 'rejected'
    ? ((result.details?.['blockers'] ?? []) as { commandId: string; commandType: string }[])
    : [];

async function verified(world: AuthoringWorld) {
  const snapshot = await world.engine.load(CAMPAIGN);
  if (!snapshot) throw new Error('missing campaign');
  expect(checkWorldIntegrity(snapshot.state)).toEqual([]);
  const log = await world.engine.commandLog(CAMPAIGN);
  expect(redecideEffective(log, snapshot, (_sheet, skill) => MODIFIERS[skill] ?? 0)).toBeNull();
  return snapshot;
}

async function committedTomas() {
  const world = await authoringWorld();
  const result = await world.commit(tomasProposal(), { confirmation: confirm('L2') });
  if (result.status !== 'accepted') throw new Error(`commit ${codeOf(result)}`);
  return { world, commitId: result.commandId };
}

const partyRecords = async (world: AuthoringWorld) => {
  const state = await world.state();
  return visibleRecords(state, holderPerspective(state, { kind: 'PARTY' }));
};

describe('undoing the Tomas commit', () => {
  it('removes Tomas, his testimony, and its disclosure in one compensation', async () => {
    const { world, commitId } = await committedTomas();
    const before = (await world.engine.load(CAMPAIGN))?.history.length ?? 0;

    expect(codeOf(await undo(world, commitId, 'undo.tomas'))).toBe('accepted');
    const snapshot = await verified(world);
    expect(snapshot.state.entities.has(TOMAS)).toBe(false);
    expect(snapshot.state.knowledge.has(TESTIMONY)).toBe(false);
    expect(snapshot.state.investigation.disclosures.has(TESTIMONY)).toBe(false);
    expect(snapshot.state.commands.get(commitId)?.undoneBy).toBe('undo.tomas');
    // History keeps every event; one compensation was appended.
    expect(snapshot.history.length).toBe(before + 1);
    expect(snapshot.history.at(-1)?.type).toBe('CommandUndone');
  });

  it('never reuses his identity', async () => {
    const { world, commitId } = await committedTomas();
    await undo(world, commitId, 'undo.tomas');
    const again = await world.commit([tomas()], { confirmation: confirm('L2') });

    expect(codeOf(again)).toBe('AUTHORING_INVALID');
    expect(again.status === 'rejected' ? again.details : null).toMatchObject({
      issues: [{ commandIndex: 0, code: 'ID_ALREADY_USED' }],
    });
  });
});

describe('when a player learned his testimony', () => {
  async function learned() {
    const { world, commitId } = await committedTomas();
    const entered = await world.submit({
      type: 'EnterLocation',
      characterId: ELOWEN,
      locationId: 'north-gate',
    });
    const asked = await world.submit({
      type: 'AskAbout',
      characterId: ELOWEN,
      npcId: TOMAS,
      topicId: 'guild-caravan',
    });
    expect([codeOf(entered), codeOf(asked)]).toEqual(['accepted', 'accepted']);
    return { world, commitId, askId: asked.commandId ?? '' };
  }

  it('the player holds an attributed testimony, not a fact', async () => {
    const { world } = await learned();
    const shared = (await partyRecords(world)).filter((record) => record.attributedTo === TOMAS);

    expect(shared).toEqual([
      expect.objectContaining({
        knowledgeType: 'TESTIMONY',
        statement: 'I saw the Merchant Guild caravan leave through the North Gate.',
      }),
    ]);
  });

  it('refuses the undo and names the conversation that depends on it', async () => {
    const { world, commitId, askId } = await learned();
    const before = await world.version();
    const result = await undo(world, commitId, 'undo.tomas');

    expect(codeOf(result)).toBe('UNDO_UNSAFE');
    expect(blockersOf(result)).toEqual([
      expect.objectContaining({ commandId: askId, commandType: 'AskAbout' }),
    ]);
    expect(await world.version()).toBe(before);
    expect((await world.state()).entities.has(TOMAS)).toBe(true);
  });

  it('undoes after the DM explicitly undid the conversation, newest first', async () => {
    const { world, commitId, askId } = await learned();
    expect(codeOf(await undo(world, askId, 'undo.ask'))).toBe('accepted');
    expect(codeOf(await undo(world, commitId, 'undo.tomas'))).toBe('accepted');

    const snapshot = await verified(world);
    expect(snapshot.state.entities.has(TOMAS)).toBe(false);
    expect((await partyRecords(world)).some((record) => record.attributedTo === TOMAS)).toBe(false);
    // The conversation and its undo remain in history.
    const types = snapshot.history.map((event) => `${event.causation.commandId}:${event.type}`);
    expect(types).toContain(`${askId}:InformationShared`);
    expect(types.filter((entry) => entry.endsWith(':CommandUndone'))).toEqual([
      'undo.ask:CommandUndone',
      'undo.tomas:CommandUndone',
    ]);
  });

  it('also names a memory that depends on him', async () => {
    const { world, commitId } = await committedTomas();
    const remembered = await world.submit(
      {
        type: 'RecordMemory',
        memoryId: 'mem-tomas-watch',
        scope: { kind: 'NPC', npcId: TOMAS },
        memoryKind: 'OBSERVATION',
        summary: 'Tomas watched the gate all morning.',
        occurredAt: (await world.state()).clock,
        locationId: 'north-gate',
        participants: [TOMAS],
      },
      DM,
    );
    expect(codeOf(remembered)).toBe('accepted');

    const result = await undo(world, commitId, 'undo.tomas');
    expect(codeOf(result)).toBe('UNDO_UNSAFE');
    expect(blockersOf(result).map((blocker) => blocker.commandType)).toEqual(['RecordMemory']);
  });
});
