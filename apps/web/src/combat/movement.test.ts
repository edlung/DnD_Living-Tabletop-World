import type { EncounterView } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { planPath } from './movement.ts';

function encounter(overrides: Partial<EncounterView['battlefield']> = {}): EncounterView {
  const unit = (id: string, x: number, y: number, state: 'up' | 'dead' = 'up') => ({
    entity: { entityId: id, kind: 'creature' as const, name: id },
    side: 'party' as const,
    position: { x, y },
    state,
    conditions: [],
  });
  return {
    encounterId: 'e1',
    locationId: 'old-trade-road',
    round: 1,
    currentCombatantId: 'a',
    order: ['a', 'b', 'c'],
    battlefield: { width: 6, height: 4, difficult: [], cover: [], ...overrides },
    combatants: [unit('a', 0, 0), unit('b', 1, 0), unit('c', 2, 1, 'dead')],
    reactionWindow: null,
  };
}

describe('planPath', () => {
  it('walks adjacent squares and never through a living combatant', () => {
    const plan = planPath(encounter(), 'a', { x: 2, y: 0 });
    expect(plan?.path.map((s) => `${s.x},${s.y}`)).toEqual(['1,1', '2,0']);
    expect(plan?.costFt).toBe(10);
  });

  it('walks over a dead combatant but not onto a living one', () => {
    expect(planPath(encounter(), 'a', { x: 2, y: 1 })?.costFt).toBe(10);
    expect(planPath(encounter(), 'a', { x: 1, y: 0 })).toBeNull();
  });

  it('charges double for difficult terrain and prefers the cheaper route', () => {
    const plan = planPath(
      encounter({
        difficult: [
          { x: 1, y: 1 },
          { x: 2, y: 1 },
        ],
      }),
      'a',
      { x: 3, y: 1 },
    );
    expect(plan?.costFt).toBe(20);
    expect(plan?.path.at(-1)).toEqual({ x: 3, y: 1 });
  });

  it('refuses the own square, outside squares, and unknown movers', () => {
    expect(planPath(encounter(), 'a', { x: 0, y: 0 })).toBeNull();
    expect(planPath(encounter(), 'a', { x: 6, y: 0 })).toBeNull();
    expect(planPath(encounter(), 'zzz', { x: 1, y: 1 })).toBeNull();
  });
});
