import type { CommandResult } from '@ltw/contracts';
import { checkWorldIntegrity, replay } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import {
  SEREN_PLAYER,
  SEREN,
  addSeren,
  cast,
  counterspell,
  ignore,
  shamanCastsAtElowen,
  withSeren,
} from '../testing/reactions.ts';
import {
  CAMPAIGN,
  ELOWEN,
  RAIDER_2,
  SHAMAN,
  codeOf,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from '../testing/road.ts';
import { verifyHistory } from '../testing/verify.ts';

/**
 * Undo and rewind with an open window (docs/adr/0016-reaction-engine.md §3,
 * fulfilling ADR 0006 §9): the ADR 0006 §8 rule, strictly reverse inside a
 * window, with explicit rejection and blockers when unsafe.
 */
const undo = (world: RoadWorld, result: CommandResult) => {
  if (result.commandId === null) throw new Error('no command ID');
  return world.dm({ type: 'UndoCommand', targetCommandId: result.commandId });
};
const blockersOf = (result: CommandResult) =>
  result.status === 'rejected' && result.code === 'UNDO_UNSAFE'
    ? (result.details?.['blockers'] as { commandId: string }[]).map((b) => b.commandId)
    : [];

describe('undoing the trigger', () => {
  it('with no answer yet removes the window together with the suspended spell', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const { trigger, windowId } = await shamanCastsAtElowen(world);
    expect(codeOf(await undo(world, trigger))).toBe('accepted');
    const state = await world.state();
    expect(state.reactionWindows.has(windowId)).toBe(false);
    expect(state.usedIds.has(windowId)).toBe(true);
    expect(state.encounter?.combatants.find((c) => c.entityId === SHAMAN)?.turn.actionUsed).toBe(
      false,
    );
    expect(codeOf(await world.submit(ignore(ELOWEN, windowId)))).toBe('REACTION_WINDOW_CLOSED');
    // The encounter goes on: the Shaman may act again, opening a new window.
    await world.dm(cast(SHAMAN, 'binding-hex', { targetId: ELOWEN }));
    expect([...(await world.state()).reactionWindows.keys()]).not.toContain(windowId);
    await verifyHistory(world);
  });

  it('after an answer is rejected, naming the answer; undone in reverse it is accepted', async () => {
    const world = await roadWorld();
    await addSeren(world);
    await startAmbush(world, [17, 3, 2, 1, 15, 5], withSeren());
    const { trigger, windowId } = await shamanCastsAtElowen(world);
    const declined = await world.submit(ignore(ELOWEN, windowId));
    const refused = await undo(world, trigger);
    expect(codeOf(refused)).toBe('UNDO_UNSAFE');
    expect(blockersOf(refused)).toEqual([declined.commandId]);
    expect(codeOf(await undo(world, declined))).toBe('accepted');
    expect((await world.state()).reactionWindows.get(windowId)?.candidates[0]?.response).toBe(
      'pending',
    );
    expect(codeOf(await undo(world, trigger))).toBe('accepted');
    expect((await world.state()).reactionWindows.size).toBe(0);
    expect(codeOf(await world.submit(ignore(SEREN, windowId), SEREN_PLAYER))).toBe(
      'REACTION_WINDOW_CLOSED',
    );
    await verifyHistory(world);
  });
});

describe('undoing an answer', () => {
  it('that countered reopens the window exactly as it was', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const { windowId } = await shamanCastsAtElowen(world);
    const before = await world.state();
    world.roll(20, 5);
    const countered = await world.submit(counterspell(ELOWEN, windowId));
    expect(codeOf(await undo(world, countered))).toBe('accepted');
    const reopened = await world.state();
    expect(reopened.reactionWindows.get(windowId)).toEqual(before.reactionWindows.get(windowId));
    expect(reopened.characterSheets.get(ELOWEN)).toEqual(before.characterSheets.get(ELOWEN));
    expect(reopened.encounter).toEqual(before.encounter);
    // Answered differently this time: the spell goes through.
    world.roll(20, 15);
    world.roll(8, 4, 4);
    expect(codeOf(await world.submit(ignore(ELOWEN, windowId)))).toBe('accepted');
    expect((await world.state()).characterSheets.get(ELOWEN)?.hitPoints.current).toBe(70);
    await verifyHistory(world);
  });

  it('that let the spell through takes the spell back too', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const { windowId } = await shamanCastsAtElowen(world);
    world.roll(20, 15);
    world.roll(8, 4, 4);
    const ignored = await world.submit(ignore(ELOWEN, windowId));
    expect((await world.state()).characterSheets.get(ELOWEN)?.hitPoints.current).toBe(70);
    expect(codeOf(await undo(world, ignored))).toBe('accepted');
    const state = await world.state();
    expect(state.characterSheets.get(ELOWEN)?.hitPoints.current).toBe(78);
    expect(state.reactionWindows.get(windowId)?.status).toBe('open');
    await verifyHistory(world);
  });
});

describe('other undos while a window is open', () => {
  it('rejects what the window read, accepts what it did not', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    // A sheet change after combat started: only the window's opening read it since.
    const sheet = (await world.state()).characterSheets.get(ELOWEN);
    const setSheet = await world.dm({ type: 'SetCharacterSheet', entityId: ELOWEN, sheet });
    world.roll(20, 15);
    const shot = await world.submit({
      type: 'Attack',
      combatantId: ELOWEN,
      attackId: 'longbow',
      targetId: RAIDER_2,
    });
    const { trigger } = await shamanCastsAtElowen(world);
    for (const earlier of [shot, setSheet]) {
      const refused = await undo(world, earlier);
      expect(codeOf(refused)).toBe('UNDO_UNSAFE');
      expect(blockersOf(refused)).toContain(trigger.commandId);
    }
    const note = await world.dm({
      type: 'AddKnowledge',
      scope: { kind: 'DM' },
      knowledgeType: 'SECRET',
      statement: 'The Shaman hesitated.',
      subjects: [SHAMAN],
      knownSince: null,
    });
    expect(codeOf(await undo(world, note))).toBe('accepted');
    expect((await world.state()).reactionWindows.size).toBe(1);
    await verifyHistory(world);
  });
});

describe('rewind', () => {
  it('reads every point of the window’s life consistently', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const { trigger, windowId } = await shamanCastsAtElowen(world);
    world.roll(20, 5);
    const countered = await world.submit(counterspell(ELOWEN, windowId));
    const history = (await world.store.loadStream(CAMPAIGN))?.events ?? [];
    const opened = history.find((e) => e.type === 'ReactionWindowOpened')?.sequence ?? 0;
    const closed = history.find((e) => e.type === 'ReactionWindowResolved')?.sequence ?? 0;
    expect(opened).toBeGreaterThan(0);
    // Integrity holds between commands; within one, the window may be mid-answer.
    const boundaries = new Set(
      history
        .filter((e, i) => history[i + 1]?.causation.commandId !== e.causation.commandId)
        .map((e) => e.sequence),
    );
    for (let sequence = opened - 2; sequence <= history.length; sequence += 1) {
      const at = replay(history, { untilSequence: sequence });
      if (boundaries.has(sequence)) {
        expect(checkWorldIntegrity(at), `at ${String(sequence)}`).toEqual([]);
      }
      const status = at.reactionWindows.get(windowId)?.status;
      if (sequence < opened) expect(status).toBeUndefined();
      else if (sequence < closed) expect(status).toBe('open');
      else expect(status).toBe('countered');
    }
    expect([trigger.status, countered.status]).toEqual(['accepted', 'accepted']);
  });
});

describe('leaving the battlefield', () => {
  it('blocks undoing the end of combat once a former combatant has left', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const { encounterId } = await world.encounter();
    const ended = await world.dm({ type: 'EndCombat', encounterId });
    const left = await world.submit({
      type: 'EnterLocation',
      characterId: ELOWEN,
      locationId: 'abandoned-caravan-site',
    });
    expect(codeOf(left)).toBe('accepted');
    const refused = await undo(world, ended);
    expect(codeOf(refused)).toBe('UNDO_UNSAFE');
    expect(blockersOf(refused)).toEqual([left.commandId]);
    await verifyHistory(world);
  });
});
