import { describe, expect, it } from 'vitest';

import { DM } from '../authoring/testing/world.ts';
import { codeOf } from '../assets/testing/world.ts';
import { DAY2 } from '../visual/testing/world.ts';
import { chronicleWorld } from './testing/world.ts';
import { memorySuggestions } from './suggestions.ts';

/**
 * Memory suggestions (owner decision of 2026-10-04, ADR 0024 §6): moments
 * the party lived but does not remember are offered to the DM as drafts.
 * Nothing is recorded until the DM submits one, and then only if the World
 * Engine accepts it as any other memory.
 */
describe('memory suggestions', () => {
  it('offer Day 2 to the DM, record nothing, and fall silent once remembered', async () => {
    const world = await chronicleWorld();
    await world.dayTwo();
    const { state, history } = await world.snapshot();
    const before = state.memories.size;
    const suggestions = memorySuggestions(state, history, { kind: 'PARTY' }, 0, state.clock);
    expect(suggestions).toEqual([
      expect.objectContaining({
        reason: 'new-day',
        occurredAt: DAY2,
        command: expect.objectContaining({
          type: 'RecordMemory',
          scope: { kind: 'PARTY' },
          summary: 'Day 2 dawned.',
          locationId: 'market-square',
        }) as unknown,
      }),
    ]);
    expect(suggestions[0]?.sources.map((source) => source.eventType)).toEqual([
      'WorldTimeAdvanced',
    ]);
    expect((await world.state()).memories.size).toBe(before);

    const recorded = await world.as(DM, { ...(suggestions[0]?.command ?? {}) });
    expect(codeOf(recorded)).toBe('accepted');
    const after = await world.snapshot();
    expect(
      memorySuggestions(after.state, after.history, { kind: 'PARTY' }, 0, after.state.clock),
    ).toEqual([]);
    await world.verified();
  });

  it('offer an arrival and a return, named as the party knows the places', async () => {
    const world = await chronicleWorld();
    await world.enter('old-trade-road');
    await world.dm({ type: 'AdvanceWorldTime', by: 7_200 });
    await world.enter('market-square');
    const { state, history } = await world.snapshot();
    const summaries = memorySuggestions(state, history, { kind: 'PARTY' }, 0, state.clock).map(
      (suggestion) => suggestion.command['summary'],
    );
    expect(summaries).toEqual(['We arrived at Old Trade Road.', 'We returned to Ravenford.']);
  });

  it('places an arrival where the party stood once that moment was over, so the engine accepts it', async () => {
    const world = await chronicleWorld();
    await world.enter('old-trade-road');
    await world.dm({ type: 'AdvanceWorldTime', by: 3_600 });
    // Back in town, Elowen steps into Orin's shop and out to the North Gate in the same minute.
    await world.enter('orins-alchemy');
    await world.enter('north-gate');
    const { state, history } = await world.snapshot();
    const returned = memorySuggestions(state, history, { kind: 'PARTY' }, 0, state.clock).find(
      (suggestion) => suggestion.command['summary'] === 'We returned to Ravenford.',
    );
    expect(returned?.command['locationId']).toBe('north-gate');
    expect(codeOf(await world.as(DM, { ...(returned?.command ?? {}) }))).toBe('accepted');
  });

  it('offers no arrival in a region the party only passed through within the same instant', async () => {
    const world = await chronicleWorld();
    await world.enter('old-trade-road');
    await world.dm({ type: 'AdvanceWorldTime', by: 3_600 });
    // Through Orin's shop and straight back out to the road, in the same minute.
    await world.enter('orins-alchemy');
    await world.enter('old-trade-road');
    const { state, history } = await world.snapshot();
    const summaries = memorySuggestions(state, history, { kind: 'PARTY' }, 0, state.clock).map(
      (suggestion) => suggestion.command['summary'],
    );
    expect(summaries).toEqual(['We arrived at Old Trade Road.', 'We returned to Old Trade Road.']);
  });
});
