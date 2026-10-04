import {
  checkWorldIntegrity,
  chronicleChapters,
  footprintOf,
  redecideEffective,
  replay,
  undoneBeneathEarlierWriters,
  writtenEarlier,
} from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { DM_PERSPECTIVE, blockersOf, chapter, stepOf, undo } from './testing/chronicle.ts';
import { eventFromRow, historicalWorld, loadHistory } from './testing/history.ts';
import { CAMPAIGN, ELOWEN, codeOf } from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * Gate 05 retest 1, G05-H02, earlier-writer compatibility (kernel rules in
 * `packages/domain/src/kernel/AGENTS.md`). The Gate 05 retest 1 writer
 * (revision a488de4, fixtures/history/a488de4-cited-examinations.json)
 * recorded a DM chapter telling two examinations that changed no fact, a
 * repeated inspection and a first inspection of an item with no clue,
 * without resting on them. Its `ChronicleGenerated` carries version 3, now
 * earlier: the current reader reads it as recorded, refuses any undo beneath
 * it, recovers when the DM undoes it first, and from now on records chapters
 * that rest on every occurrence they tell. That writer also accepted the undo
 * of a told examination beneath its chapter
 * (fixtures/history/a488de4-cited-examination-undone.json): the current reader
 * reads that history as recorded, its audits name the orphaned entry and the
 * undo, and undoing the chapter recovers.
 */
const fixture = await loadHistory('a488de4-cited-examinations');
const undone = await loadHistory('a488de4-cited-examination-undone');
const step = stepOf(fixture);
const CITED = ['repeat-inspection', 'token-inspection'];

describe('the Gate 05 retest 1 writer’s chapter under the current reader', () => {
  it('parses and replays every prefix, and reads its chapter as recorded with every source', () => {
    const events = fixture.events.map(eventFromRow);
    expect(events).toHaveLength(fixture.stream.version);
    const chapters = events.filter((event) => event.type === 'ChronicleGenerated');
    expect(chapters.map((event) => event.causation.commandId)).toEqual([step('dm-chapter')]);
    expect(chapters.map((event) => event.schemaVersion)).toEqual([3]);
    expect(chapters.every(writtenEarlier)).toBe(true);
    const recorded = chapters[0]?.type === 'ChronicleGenerated' ? chapters[0].payload : null;
    for (const name of CITED) {
      // Told, though the examination wrote no fact the chapter could rest on.
      const told = recorded?.entries.find(
        (entry) => entry.source.kind === 'event' && entry.source.commandId === step(name),
      );
      expect(told?.source).toMatchObject({ eventType: 'EvidenceExamined' });
      const own = events.filter((event) => event.causation.commandId === step(name));
      expect(own.flatMap((event) => footprintOf(event).writes)).toEqual([]);
    }
    for (const row of fixture.commands) {
      expect(checkWorldIntegrity(replay(events.slice(0, row.last_sequence)))).toEqual([]);
    }
    const state = replay(events);
    expect(state.chronicles.get(step('dm-chapter'))?.entries).toEqual(recorded?.entries);
    const [view] = chronicleChapters({ state, history: events }, DM_PERSPECTIVE);
    expect(view?.entries.map((entry) => entry.text)).toContain(
      'Elowen Starwhisper examined Ordinary Token.',
    );
    expect(view?.entries.every((entry) => entry.sources.length > 0)).toBe(true);
  });

  it('refuses undo of each cited examination beneath its chapter, then recovers chapter first', async () => {
    const world = await historicalWorld(fixture);
    const before = await world.state();
    for (const name of CITED) {
      const refused = await undo(world, step(name));
      expect(codeOf(refused), name).toBe('UNDO_UNSAFE');
      expect(blockersOf(refused)).toContain(step('dm-chapter'));
    }
    expect(await world.state()).toEqual(before);
    await verifyHistory(world);
    // After the chapter, so no chapter tells it: it stays undoable.
    expect(codeOf(await undo(world, step('later-inspection')))).toBe('accepted');
    for (const name of ['dm-chapter', 'token-inspection', 'repeat-inspection']) {
      expect(codeOf(await undo(world, step(name))), name).toBe('accepted');
    }
    await verifyHistory(world);
  });

  it('records chapters that rest on every examination they tell from now on', async () => {
    const world = await historicalWorld(fixture);
    const fresh = await world.submit({
      type: 'ExamineEntity',
      characterId: ELOWEN,
      entityId: 'ordinary-token',
      method: 'inspect',
    });
    expect(fresh).toMatchObject({
      status: 'accepted',
      outcome: { roll: null, discovered: [] },
    });
    const told = await chapter(world, DM_PERSPECTIVE, 'DM');
    expect(codeOf(told)).toBe('accepted');
    const recorded = (await world.store.loadStream(CAMPAIGN))?.events.filter(
      (event) => event.type === 'ChronicleGenerated' && !writtenEarlier(event),
    );
    expect(recorded?.map((event) => event.causation.commandId)).toEqual([told.commandId]);
    const examined = fresh.commandId ?? '';
    for (const commandId of [examined, step('later-inspection')]) {
      const refused = await undo(world, commandId);
      expect(codeOf(refused), commandId).toBe('UNDO_UNSAFE');
      expect(blockersOf(refused)).toEqual([told.commandId]);
    }
    await verifyHistory(world);
    expect(codeOf(await undo(world, told.commandId ?? ''))).toBe('accepted');
    expect(codeOf(await undo(world, examined))).toBe('accepted');
    await verifyHistory(world);
  });
});

describe('the undo that writer accepted beneath its chapter', () => {
  const told = step('repeat-inspection');
  const chapterId = step('dm-chapter');

  it('reads as recorded, and the audits name the orphaned entry and the undo', () => {
    const events = undone.events.map(eventFromRow);
    const state = replay(events);
    expect(state.commands.get(told)?.undoneBy).toBe(stepOf(undone)('undo-repeat-inspection'));
    const key = state.chronicles
      .get(chapterId)
      ?.entries.find(
        (entry) => entry.source.kind === 'event' && entry.source.commandId === told,
      )?.key;
    const [view] = chronicleChapters({ state, history: events }, DM_PERSPECTIVE);
    const orphan = view?.entries.find((entry) => entry.key === key);
    expect(orphan?.text).toBe('Elowen Starwhisper examined Strange Symbol.');
    expect(orphan?.sources).toEqual([]);
    expect(checkWorldIntegrity(state)).toEqual([
      `chronicle ${chapterId} tells undone command ${told}`,
    ]);
    expect(undoneBeneathEarlierWriters(state, events)).toEqual([
      stepOf(undone)('undo-repeat-inspection'),
    ]);
  });

  it('refuses further undo beneath the chapter, and recovers when the DM undoes it', async () => {
    const world = await historicalWorld(undone);
    const refused = await undo(world, step('token-inspection'));
    expect(codeOf(refused)).toBe('UNDO_UNSAFE');
    expect(blockersOf(refused)).toContain(chapterId);
    expect(codeOf(await undo(world, chapterId))).toBe('accepted');
    const state = await world.state();
    const history = (await world.store.loadStream(CAMPAIGN))?.events ?? [];
    expect(replay(history)).toEqual(state);
    expect(checkWorldIntegrity(state)).toEqual([]);
    expect(
      redecideEffective(await world.engine.commandLog(CAMPAIGN), { state, history }, () => 0),
    ).toBeNull();
    // The audit keeps naming the undo that writer accepted while the chapter stood.
    expect(undoneBeneathEarlierWriters(state, history)).toEqual([
      stepOf(undone)('undo-repeat-inspection'),
    ]);
  });
});
