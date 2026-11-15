import { describe, expect, it } from 'vitest';

import { DM } from '../authoring/testing/world.ts';
import { codeOf } from '../assets/testing/world.ts';
import { facts } from '../kernel/fact-keys.ts';
import { holderPerspective } from '../knowledge/perspective.ts';
import { chronicleWorld, type ChronicleWorld } from './testing/world.ts';
import { memorySuggestions, suggestionsOfSession } from './suggestions.ts';
import { chronicleChapters } from './views.ts';

/**
 * A session's chapter (docs/adr/0071-memory-and-ritual.md §1.2): the world's clock often stands
 * still from one evening to the next, so a window in world time cannot tell two evenings apart.
 * A chapter of a session tells, of the window's memories, only those recorded with that session.
 */
/** The test world opens mid-session: that session ends before the evenings of a test begin. */
async function fresh(): Promise<ChronicleWorld> {
  const world = await chronicleWorld();
  const { activeSessionId } = await world.state();
  if (activeSessionId !== null) {
    expect(codeOf(await world.as(DM, { type: 'EndSession', sessionId: activeSessionId }))).toBe(
      'accepted',
    );
  }
  return world;
}

async function evening(world: ChronicleWorld, sessionId: string, summary: string) {
  expect(codeOf(await world.as(DM, { type: 'StartSession', sessionId, title: sessionId }))).toBe(
    'accepted',
  );
  const { clock } = await world.state();
  expect(
    codeOf(
      await world.as(DM, {
        type: 'RecordMemory',
        memoryId: `mem-${sessionId}`,
        scope: { kind: 'PARTY' },
        memoryKind: 'CONSEQUENCE',
        summary,
        occurredAt: clock,
        sessionId,
      }),
    ),
  ).toBe('accepted');
  expect(codeOf(await world.as(DM, { type: 'EndSession', sessionId }))).toBe('accepted');
}

const partyChapters = async (world: ChronicleWorld) => {
  const snapshot = await world.snapshot();
  return chronicleChapters(snapshot, holderPerspective(snapshot.state, { kind: 'PARTY' }));
};

describe('a session’s chapter', () => {
  it('tells only that session’s memories, though two evenings share one instant of the world', async () => {
    const world = await fresh();
    await evening(world, 'evening-one', 'We swore to find the caravan.');
    await evening(world, 'evening-two', 'We found the broken wheel.');
    const state = await world.state();
    // The clock never moved: both evenings start and end at the same world time.
    expect(state.sessions.get('evening-one')?.startedAt).toBe(state.clock);
    expect(state.sessions.get('evening-two')?.endedAt).toBe(state.clock);

    const second = await world.generate({
      title: 'evening-two',
      sessionId: 'evening-two',
      from: state.clock,
    });
    expect(codeOf(second)).toBe('accepted');
    const first = await world.generate({ title: 'evening-one', sessionId: 'evening-one' });
    expect(codeOf(first)).toBe('accepted');

    const [two, one] = await partyChapters(world);
    expect(two?.sessionId).toBe('evening-two');
    expect(two?.entries.map((entry) => entry.memoryId)).toEqual(['mem-evening-two']);
    expect(one?.sessionId).toBe('evening-one');
    expect(one?.entries.map((entry) => entry.memoryId)).toEqual(['mem-evening-one']);
    await world.verified();
  });

  it('tells the party only the party’s memories of the session, never another holder’s', async () => {
    const world = await chronicleWorld();
    const { activeSessionId } = await world.state();
    if (activeSessionId === null) throw new Error('the test world opens mid-session');
    const before = await world.state();
    const ofSession = [...before.memories.values()].filter(
      (memory) => memory.sessionId === activeSessionId,
    );
    const others = ofSession.filter((memory) => memory.scope.kind !== 'PARTY');
    // The session holds memories of other holders too (Elowen's own, an NPC's): the test bites.
    expect(others.map((memory) => memory.scope.kind)).toEqual(
      expect.arrayContaining(['CHARACTER']),
    );
    expect(codeOf(await world.generate({ sessionId: activeSessionId, from: -1e9 }))).toBe(
      'accepted',
    );
    const [chapter] = await partyChapters(world);
    const told = new Set(chapter?.entries.map((entry) => entry.memoryId));
    for (const memory of others.filter((entry) => entry.scope.kind !== 'PUBLIC')) {
      expect(told.has(memory.memoryId), `told ${memory.memoryId}`).toBe(false);
    }
    expect(told.has('mem-party-talk-mira')).toBe(true);
    await world.verified();
  });

  it('leaves a chapter of a window alone as it was: every memory of the window', async () => {
    const world = await fresh();
    await evening(world, 'evening-one', 'We swore to find the caravan.');
    expect(codeOf(await world.generate())).toBe('accepted');
    const [chapter] = await partyChapters(world);
    expect(chapter?.sessionId).toBeNull();
    const told = chapter?.entries.map((entry) => entry.memoryId) ?? [];
    expect(told).toContain('mem-evening-one');
    expect(told).toContain('mem-party-talk-mira');
  });

  it('rests on its session, and is refused for no session, for the DM’s view, or with nothing to tell', async () => {
    const world = await fresh();
    await evening(world, 'evening-one', 'We swore to find the caravan.');
    expect(codeOf(await world.generate({ sessionId: 'no-such-evening' }))).toBe(
      'INVALID_CHRONICLE',
    );
    expect(codeOf(await world.generate({ sessionId: 'evening-one', perspective: 'DM' }))).toBe(
      'INVALID_CHRONICLE',
    );
    // A session nobody kept a moment of: nothing to tell.
    expect(
      codeOf(await world.as(DM, { type: 'StartSession', sessionId: 'quiet', title: 'Quiet' })),
    ).toBe('accepted');
    expect(codeOf(await world.generate({ sessionId: 'quiet' }))).toBe('INVALID_CHRONICLE');

    expect(codeOf(await world.generate({ sessionId: 'evening-one' }))).toBe('accepted');
    const { state } = await world.snapshot();
    const [record] = [...state.chronicles.values()];
    expect(record?.rests).toContain(facts.session('evening-one'));
    expect(record?.rests).toContain(facts.memory('mem-evening-one'));
    await world.verified();
  });
});

describe('a session’s suggested moments', () => {
  it('are those since it started: an earlier evening’s day is not offered again', async () => {
    const world = await fresh();
    expect(
      codeOf(await world.as(DM, { type: 'StartSession', sessionId: 'one', title: 'One' })),
    ).toBe('accepted');
    await world.dayTwo();
    expect(codeOf(await world.as(DM, { type: 'EndSession', sessionId: 'one' }))).toBe('accepted');
    expect(
      codeOf(await world.as(DM, { type: 'StartSession', sessionId: 'two', title: 'Two' })),
    ).toBe('accepted');
    const { state, history } = await world.snapshot();
    const all = memorySuggestions(state, history, { kind: 'PARTY' }, 0, state.clock);
    expect(all.map((suggestion) => suggestion.reason)).toEqual(['new-day']);

    expect(suggestionsOfSession(history, 'one', all).map((entry) => entry.reason)).toEqual([
      'new-day',
    ]);
    expect(suggestionsOfSession(history, 'two', all)).toEqual([]);
    expect(suggestionsOfSession(history, 'no-such-evening', all)).toEqual([]);
  });
});
