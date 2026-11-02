import { describe, expect, it } from 'vitest';

import { coverageInventory, type LiveTarget } from './inventory.ts';

/** The coverage inventory of docs/STAGE_310_DESIGN.md §A, per perspective kind. */
const target = (overrides: Partial<LiveTarget>): LiveTarget => ({
  campaignId: 'ravenford',
  perspective: 'PARTY',
  kind: 'PARTY',
  focus: null,
  place: null,
  identity: true,
  ...overrides,
});

const paths = (views: ReturnType<typeof coverageInventory>) =>
  views.map((view) => `${new URL(view.url, 'http://test').pathname}${view.optional ? ' ?' : ''}`);

const ALWAYS = [
  '/campaigns/ravenford/session',
  '/campaigns/ravenford/sessions',
  '/campaigns/ravenford/entities',
  '/campaigns/ravenford/knowledge',
  '/campaigns/ravenford/memories',
  '/campaigns/ravenford/encounter',
  '/campaigns/ravenford/quests',
  '/campaigns/ravenford/chronicle',
  '/campaigns/ravenford/presence',
];

describe('the coverage inventory', () => {
  it('covers the views every perspective reads', () => {
    expect(paths(coverageInventory(target({})))).toEqual(ALWAYS);
  });

  it('adds surroundings, the player’s undone actions and the focused context for an acting character', () => {
    const views = coverageInventory(
      target({
        perspective: 'PLAYER',
        kind: 'CHARACTER',
        focus: 'mira-vale',
        place: 'market-square',
      }),
    );
    expect(paths(views)).toEqual([
      ...ALWAYS,
      // The table's rolls and the DM's requests (Stage 510), the open short rest (Stage 530).
      '/campaigns/ravenford/rolls',
      '/campaigns/ravenford/check-requests',
      '/campaigns/ravenford/rest',
      '/campaigns/ravenford/surroundings',
      '/campaigns/ravenford/undone-actions',
      '/campaigns/ravenford/entities/mira-vale/context ?',
      '/campaigns/ravenford/entities/mira-vale/knowledge ?',
      '/campaigns/ravenford/entities/mira-vale/presentation ?',
      '/campaigns/ravenford/locations/market-square/scene ?',
    ]);
    for (const view of views) {
      const parsed = new URL(view.url, 'http://test');
      // AI ranking never runs for a comparison.
      expect(parsed.searchParams.has('ranking')).toBe(false);
      if (!/\/sessions?$/.test(parsed.pathname)) {
        expect(parsed.searchParams.get('perspective')).toBe('PLAYER');
      }
    }
  });

  it('adds memory suggestions, the DM history and the asset lineage for the DM and no character-only view', () => {
    const views = coverageInventory(target({ perspective: 'DM', kind: 'DM', focus: 'mira-vale' }));
    expect(paths(views)).toEqual([
      ...ALWAYS,
      '/campaigns/ravenford/rolls',
      '/campaigns/ravenford/check-requests',
      '/campaigns/ravenford/rest',
      '/campaigns/ravenford/chronicle/suggestions',
      '/campaigns/ravenford/dm/history',
      '/campaigns/ravenford/assets',
      '/campaigns/ravenford/entities/mira-vale/knowledge ?',
      '/campaigns/ravenford/entities/mira-vale/presentation ?',
    ]);
    const history = views.find((view) => view.url.includes('/dm/history'));
    expect(new URL(history?.url ?? '', 'http://test').searchParams.get('perspective')).toBe('DM');
    // The lineage route takes no perspective: it answers the campaign's DM only.
    const lineage = views.find((view) => view.url.endsWith('/assets'));
    expect(lineage?.url).toBe('/campaigns/ravenford/assets');
  });

  it('never covers the DM history or the asset lineage for a lower perspective, the DM’s included', () => {
    for (const lower of [
      target({}),
      target({ perspective: 'PLAYER', kind: 'CHARACTER' }),
      target({ perspective: 'CHARACTER:elowen-starwhisper', kind: 'CHARACTER', identity: false }),
      target({ perspective: 'NPC:mira-vale', kind: 'NPC', identity: false }),
    ]) {
      const covered = paths(coverageInventory(lower));
      expect(covered.some((path) => path.includes('/dm/'))).toBe(false);
      expect(covered.some((path) => path.endsWith('/assets'))).toBe(false);
    }
  });

  it("leaves out the DM's identity while the DM holds a lower perspective", () => {
    const views = coverageInventory(
      target({ perspective: 'NPC:mira-vale', kind: 'NPC', identity: false }),
    );
    expect(paths(views)).toEqual(ALWAYS.filter((path) => !path.endsWith('/session')));
  });
});
