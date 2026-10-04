import { holderPerspective, type WorldState } from '@ltw/domain';
import { beforeAll, describe, expect, it } from 'vitest';

import { buildContext } from './context-builder.ts';
import { ASHEN_CIRCLE_ID, FORBIDDEN_MARKERS, seedRavenford } from './testing/ravenford.ts';

/**
 * ContextBuilder scope (ADR 0017 §3): a context is a perspective's
 * projection and nothing more. The Gate 01 boundary fixture applies to every
 * perspective, with every section included.
 */
let state: WorldState;
beforeAll(async () => {
  ({ state } = await seedRavenford());
});

type HolderScope = Parameters<typeof holderPerspective>[1];

function scopeOf(key: string): HolderScope {
  const [kind = '', id = ''] = key.split(':');
  if (kind === 'CHARACTER') return { kind, characterId: id };
  if (kind === 'NPC') return { kind, npcId: id };
  if (kind === 'PUBLIC' || kind === 'PARTY') return { kind };
  throw new Error(`unknown perspective ${key}`);
}

describe('buildContext', () => {
  it('gives a DM intent only the public directory and the world time', () => {
    const context = buildContext(state, holderPerspective(state, { kind: 'PUBLIC' }), [
      'world-time',
      'entities',
    ]);

    expect(context.scope).toBe('PUBLIC');
    expect(new Set(context.items.map((item) => item.kind))).toEqual(
      new Set(['world-time', 'entity']),
    );
    expect(context.items[0]).toMatchObject({ sourceId: 'world#clock', kind: 'world-time' });
    expect(context.entities.map((e) => e.entityId).sort()).toEqual([
      'captain-thorne',
      'golden-stag-inn',
      'guild-caravan',
      'market-square',
      'merchant-guild',
      'merchant-guild-faction',
      'mira-vale',
      'north-gate',
      'old-trade-road',
      'orin-stonebeard',
      'orins-alchemy',
      'ravenford',
      'ravenford-guard',
    ]);
    const text = JSON.stringify(context);
    for (const marker of [
      ASHEN_CIRCLE_ID,
      'Ashen',
      'abandoned-caravan-site',
      'elowen',
      'before dawn',
    ]) {
      expect(text).not.toContain(marker);
    }
  });

  it('names a source for every item', () => {
    const context = buildContext(
      state,
      holderPerspective(state, { kind: 'NPC', npcId: 'mira-vale' }),
      ['world-time', 'entities', 'records'],
    );

    expect(context.items.some((item) => item.kind === 'record')).toBe(true);
    for (const item of context.items) expect(item.sourceId).not.toBe('');
  });

  it.each(Object.keys(FORBIDDEN_MARKERS))('never leaks past the %s boundary', (key) => {
    const context = buildContext(state, holderPerspective(state, scopeOf(key)), [
      'world-time',
      'entities',
      'records',
    ]);
    const text = JSON.stringify(context);

    for (const marker of FORBIDDEN_MARKERS[key] ?? []) expect(text).not.toContain(marker);
  });

  it('reads nothing outside the requested sections', () => {
    const context = buildContext(state, holderPerspective(state, { kind: 'PUBLIC' }), []);

    expect(context).toEqual({ scope: 'PUBLIC', items: [], entities: [], worldTime: state.clock });
  });
});
