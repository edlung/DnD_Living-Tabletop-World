import { describe, expect, it } from 'vitest';

import { hash } from '../assets/testing/world.ts';
import { holderPerspective } from '../knowledge/perspective.ts';
import { MEMO_LIMIT } from './memo.ts';
import { DAY1, DAY1_NIGHT, visualWorld } from './testing/world.ts';
import { assetContentAt, presentableContent, timelineOf } from './views.ts';

/**
 * Remembered views (Gate 06 review): a scene's N pictures cost one replay, not N. The timeline and
 * a perspective's servable pictures are built once per history version, perspective and time,
 * forgotten with that version, and bounded per version.
 */
describe('views remembered per history version', () => {
  it('separates prepared-party contexts with identical labels/scopes and the same history', async () => {
    const world = await visualWorld();
    await world.dm({
      type: 'CreateEntity',
      entityId: 'unnamed-preview-feature',
      kind: 'feature',
      name: 'Unidentified carved stone',
      description: 'A carved stone.',
      existsSince: null,
      placement: { locationId: 'market-square', since: null },
    });
    await world.approved('unnamed-preview-feature', 91);
    const snapshot = await world.snapshot();
    const without = holderPerspective(snapshot.state, { kind: 'PARTY' }, { memberIds: new Set() });
    const withHolder = holderPerspective(
      snapshot.state,
      { kind: 'PARTY' },
      {
        memberIds: new Set(['elowen-starwhisper']),
      },
    );
    expect(without.label).toBe(withHolder.label);
    expect(without.scopes).toEqual(withHolder.scopes);
    expect(assetContentAt(snapshot, without, hash(91), null)).toBeNull();
    expect(assetContentAt(snapshot, withHolder, hash(91), null)).toEqual({
      mediaType: 'image/svg+xml',
    });
    expect(assetContentAt(snapshot, without, hash(91), null)).toBeNull();
  });
  it('builds the timeline and the servable pictures once for many content requests', async () => {
    const world = await visualWorld();
    await world.approved('mira-vale', 1);
    const snapshot = await world.snapshot();
    const elowen = await world.elowen();
    const timeline = timelineOf(snapshot, null);
    const content = presentableContent(snapshot, elowen, null);
    for (let request = 0; request < 20; request += 1) {
      expect(assetContentAt(snapshot, elowen, hash(1), null)).toEqual({
        mediaType: 'image/svg+xml',
      });
    }
    expect(timelineOf(snapshot, null)).toBe(timeline);
    expect(timelineOf(snapshot, snapshot.state.clock)).toBe(timeline);
    expect(presentableContent(snapshot, elowen, null)).toBe(content);
    // The engine hands out the same frozen history until the world changes.
    expect((await world.snapshot()).history).toBe(snapshot.history);
    expect(presentableContent(await world.snapshot(), elowen, null)).toBe(content);
    // Another perspective or time is its own entry.
    expect(presentableContent(snapshot, await world.party(), null)).not.toBe(content);
    expect(timelineOf(snapshot, snapshot.state.clock - 3_600)).not.toBe(timeline);
  });

  it('forgets a history version once the world changes, and an unfrozen history at once', async () => {
    const world = await visualWorld();
    const before = await world.snapshot();
    const timeline = timelineOf(before, null);
    await world.dm({ type: 'AdvanceWorldTime', to: DAY1_NIGHT });
    const after = await world.snapshot();
    expect(after.history).not.toBe(before.history);
    expect(timelineOf(after, before.state.clock)).not.toBe(timeline);
    const unfrozen = { state: after.state, history: [...after.history] };
    expect(timelineOf(unfrozen, null)).not.toBe(timelineOf(unfrozen, null));
  });

  it('keeps at most MEMO_LIMIT entries per version, dropping the least recently used', async () => {
    const world = await visualWorld();
    await world.dm({ type: 'AdvanceWorldTime', to: DAY1_NIGHT });
    const snapshot = await world.snapshot();
    const first = timelineOf(snapshot, DAY1);
    const second = timelineOf(snapshot, DAY1 + 1);
    for (let extra = 2; extra < MEMO_LIMIT; extra += 1) timelineOf(snapshot, DAY1 + extra);
    // MEMO_LIMIT entries. Used again, `first` is the most recent; `second` is now the oldest.
    expect(timelineOf(snapshot, DAY1)).toBe(first);
    timelineOf(snapshot, DAY1 + MEMO_LIMIT);
    expect(timelineOf(snapshot, DAY1)).toBe(first);
    expect(timelineOf(snapshot, DAY1 + 1)).not.toBe(second);
  });
});
