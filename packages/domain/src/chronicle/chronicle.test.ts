import type { CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { DM, PLAYER } from '../authoring/testing/world.ts';
import { codeOf } from '../assets/testing/world.ts';
import { holderPerspective } from '../knowledge/perspective.ts';
import { DM_VIEW } from '../visual/testing/world.ts';
import { chronicleWorld } from './testing/world.ts';
import { chronicleChapters } from './views.ts';

/**
 * The Stage 170 validation gate (docs/adr/0024-chronicle.md): every material
 * Chronicle claim traces to source events, and prose cannot mutate state. A
 * party chapter is told from the party's memories only, keeping each
 * account's epistemic type; the DM's chapter is told from events.
 */
const issuesOf = (result: CommandResult) =>
  result.status === 'rejected' ? ((result.details?.['issues'] ?? []) as string[]) : [];

describe('a party chapter', () => {
  it('tells the party’s memories, each traced to the events that recorded it', async () => {
    const world = await chronicleWorld();
    const generated = await world.generate();
    expect(codeOf(generated)).toBe('accepted');
    const snapshot = await world.snapshot();
    const party = holderPerspective(snapshot.state, { kind: 'PARTY' });
    const [chapter] = chronicleChapters(snapshot, party);
    expect(chapter?.title).toBe('Chapter I — Shadows on the Trade Road');

    const told = chapter?.entries.map((entry) => entry.memoryId) ?? [];
    expect(told).toEqual(['mem-party-talk-mira', 'mem-party-decide-road', 'mem-party-supplies']);
    // Never another holder's memory, never a raw event.
    for (const hidden of ['mem-elowen-mira-glance', 'mem-mira-departure', 'mem-thorne-departure']) {
      expect(told).not.toContain(hidden);
    }
    expect(chapter?.entries.every((entry) => entry.eventType === null)).toBe(true);

    const effective = new Map(snapshot.history.map((event) => [event.eventId, event]));
    for (const entry of chapter?.entries ?? []) {
      expect(entry.sources.length).toBeGreaterThan(0);
      const recorded = entry.sources.map((source) => effective.get(source.eventId));
      expect(recorded[0]).toMatchObject({
        type: 'MemoryRecorded',
        payload: { memoryId: entry.memoryId },
      });
      // Players get event IDs and types, never stream sequences.
      for (const source of entry.sources) expect(source.sequence).toBeUndefined();
    }
    // Every paragraph cites entries of the chapter.
    const keys = new Set(chapter?.entries.map((entry) => entry.key));
    for (const paragraph of chapter?.prose.paragraphs ?? []) {
      expect(paragraph.cites.length).toBeGreaterThan(0);
      for (const key of paragraph.cites) expect(keys.has(key)).toBe(true);
    }
    expect(chapter?.prose.traceId).toBeNull();
    await world.verified();
  });

  it('keeps Mira’s account an account, typed TESTIMONY, in its entry and its prose', async () => {
    const world = await chronicleWorld();
    await world.generate();
    const snapshot = await world.snapshot();
    const [chapter] = chronicleChapters(
      snapshot,
      holderPerspective(snapshot.state, { kind: 'PARTY' }),
    );
    const talk = chapter?.entries.find((entry) => entry.memoryId === 'mem-party-talk-mira');
    expect(talk?.knowledge).toEqual([
      {
        knowledgeId: 'party-mira-departure',
        knowledgeType: 'TESTIMONY',
        statement: 'Mira Vale says the caravan left before dawn.',
      },
    ]);
    expect(talk?.sources.map((source) => source.eventType)).toEqual([
      'MemoryRecorded',
      'KnowledgeAssigned',
    ]);
    const paragraph = chapter?.prose.paragraphs.find((p) => p.cites.includes(talk?.key ?? ''));
    expect(paragraph?.text).toContain('According to that account');
  });

  it('refuses prose that cites nothing told, tells an account as fact, or names IDs', async () => {
    const world = await chronicleWorld();
    const unknown = await world.generate({ paragraphs: [{ text: 'We rode out.', cites: ['e9'] }] });
    expect(codeOf(unknown)).toBe('INVALID_CHRONICLE');
    expect(issuesOf(unknown)).toEqual([expect.stringContaining('"e9" is no entry')]);

    const asFact = await world.generate({
      paragraphs: [{ text: 'The caravan left before dawn.', cites: ['e1'] }],
    });
    expect(codeOf(asFact)).toBe('INVALID_CHRONICLE');
    expect(issuesOf(asFact)).toEqual([expect.stringContaining('account or a guess as fact')]);

    const withIds = await world.generate({
      paragraphs: [{ text: 'Mira said so (mem-party-talk-mira).', cites: ['e1'] }],
    });
    expect(issuesOf(withIds)).toEqual([expect.stringContaining('contains an ID')]);
  });

  it('cannot change the world, whatever its prose says', async () => {
    const world = await chronicleWorld();
    const before = await world.state();
    const result = await world.generate({
      paragraphs: [
        {
          text: 'Mira said the caravan left before dawn. Then Orin Stonebeard died and Ravenford burned.',
          cites: ['e1'],
        },
        { text: 'We bought the whole market.', cites: ['e2', 'e3'] },
      ],
    });
    expect(codeOf(result)).toBe('accepted');
    const after = await world.state();
    const facts = (state: typeof before) =>
      Object.fromEntries(
        Object.entries(state).filter(
          ([key]) => !['chronicles', 'version', 'commands'].includes(key),
        ),
      );
    expect(facts(after)).toEqual(facts(before));
    expect(after.entities.get('orin-stonebeard')?.status).toBe('active');
  });

  it('refuses empty windows, the future, unknown perspectives, and players', async () => {
    const world = await chronicleWorld();
    const clock = (await world.state()).clock;
    expect(codeOf(await world.generate({ from: clock + 1, to: clock + 1 }))).toBe(
      'INVALID_CHRONICLE',
    );
    expect(codeOf(await world.generate({ from: -100, to: -50 }))).toBe('INVALID_CHRONICLE');
    expect(codeOf(await world.generate({ perspective: 'PLAYER' }))).toBe('INVALID_CHRONICLE');
    expect(codeOf(await world.generate({ perspective: 'NPC:nobody' }))).toBe('INVALID_CHRONICLE');
    expect(codeOf(await world.generate({ actor: PLAYER }))).toBe('FORBIDDEN');
  });
});

describe('a chapter in history', () => {
  it('rests on what it tells: a told memory cannot be undone beneath it', async () => {
    const world = await chronicleWorld();
    const memory = await world.as(DM, {
      type: 'RecordMemory',
      scope: { kind: 'PARTY' },
      memoryKind: 'DECISION',
      summary: 'We thought goblins had taken the caravan.',
      occurredAt: (await world.state()).clock,
      relatedKnowledge: ['party-goblin-hypothesis'],
    });
    const chapter = await world.generate();
    expect(codeOf(await world.undo(memory.commandId ?? ''))).toBe('UNDO_UNSAFE');
    expect(codeOf(await world.undo(chapter.commandId ?? ''))).toBe('accepted');
    expect(codeOf(await world.undo(memory.commandId ?? ''))).toBe('accepted');
    await world.verified();
  });

  it('marks the party’s hypothesis as one', async () => {
    const world = await chronicleWorld();
    await world.as(DM, {
      type: 'RecordMemory',
      scope: { kind: 'PARTY' },
      memoryKind: 'DECISION',
      summary: 'We thought goblins had taken the caravan.',
      occurredAt: (await world.state()).clock,
      relatedKnowledge: ['party-goblin-hypothesis'],
    });
    // ADVERSARIAL_TESTS.md C.2: a hypothesis told as history is refused.
    const asHistory = await world.generate({
      paragraphs: [
        { text: 'Mira said the caravan left before dawn.', cites: ['e1'] },
        { text: 'We decided to go.', cites: ['e2', 'e3'] },
        { text: 'Goblins attacked the caravan.', cites: ['e4'] },
      ],
    });
    expect(codeOf(asHistory)).toBe('INVALID_CHRONICLE');
    expect(codeOf(await world.generate())).toBe('accepted');
    const snapshot = await world.snapshot();
    const [chapter] = chronicleChapters(
      snapshot,
      holderPerspective(snapshot.state, { kind: 'PARTY' }),
    );
    const guess = chapter?.entries.find(
      (entry) => entry.knowledge[0]?.knowledgeType === 'HYPOTHESIS',
    );
    expect(guess?.knowledge[0]?.statement).toBe('Goblins attacked the caravan.');
    expect(
      chapter?.prose.paragraphs.find((p) => p.cites.includes(guess?.key ?? ''))?.text,
    ).toContain('A suspicion, not established');
  });
});

describe('the DM’s chapter', () => {
  it('is told from salient events, traced with sequences, and read by the DM alone', async () => {
    const world = await chronicleWorld();
    await world.dayTwo();
    await world.dm({ type: 'ChangeEntityStatus', entityId: 'orin-stonebeard', status: 'dead' });
    expect(codeOf(await world.generate({ perspective: 'DM' }))).toBe('accepted');
    await world.generate();
    const snapshot = await world.snapshot();
    const [dmChapter] = chronicleChapters(snapshot, DM_VIEW).filter((c) => c.perspective === 'DM');
    const texts = dmChapter?.entries.map((entry) => entry.text) ?? [];
    expect(texts).toEqual(expect.arrayContaining(['Day 2 began.', 'Orin Stonebeard died.']));
    const death = dmChapter?.entries.find((entry) => entry.text === 'Orin Stonebeard died.');
    expect(death?.eventType).toBe('EntityStatusChanged');
    expect(death?.sources[0]).toMatchObject({
      eventType: 'EntityStatusChanged',
      sequence: expect.any(Number) as number,
    });
    const party = holderPerspective(snapshot.state, { kind: 'PARTY' });
    expect(chronicleChapters(snapshot, party).map((c) => c.perspective)).toEqual(['PARTY']);
    await world.verified();
  });
});
