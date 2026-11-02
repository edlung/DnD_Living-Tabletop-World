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

  it('passes through an ally’s square at double cost, never ending there, and never a wall', () => {
    // With (0, 1) and (1, 1) walled, the way east runs through b at (1, 0): 10 ft, then 5.
    const plan = planPath(
      encounter({
        walls: [
          { x: 0, y: 1 },
          { x: 1, y: 1 },
        ],
      }),
      'a',
      { x: 2, y: 0 },
    );
    expect(plan?.path).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    expect(plan?.costFt).toBe(15);
    expect(planPath(encounter({ walls: [{ x: 4, y: 2 }] }), 'a', { x: 4, y: 2 })).toBeNull();
  });

  it('keeps a Large mover’s whole space clear, squeezing through a gap a square wide', () => {
    // docs/adr/0049-space-and-movement.md §1, §4: walls at x = 3 but for (3, 1).
    const base = encounter({
      walls: [
        { x: 3, y: 0 },
        { x: 3, y: 2 },
        { x: 3, y: 3 },
      ],
    });
    const [first] = base.combatants;
    if (!first) throw new Error('no mover');
    const view: EncounterView = {
      ...base,
      combatants: [{ ...first, size: 'large', position: { x: 0, y: 1 } }],
    };
    const plan = planPath(view, 'a', { x: 4, y: 1 });
    // Whole, squeezed twice through the gap at (3, 1), whole again: 5 + 10 + 10 + 5.
    expect(plan?.path.map((s) => `${String(s.x)},${String(s.y)}`)).toContain('3,1');
    expect(plan?.path.at(-1)).toEqual({ x: 4, y: 1 });
    expect(plan?.costFt).toBe(30);
    // At (5, 1) its space would hang past the edge: it squeezes there, 10 ft more.
    expect(planPath(view, 'a', { x: 5, y: 1 })?.costFt).toBe(40);
  });
});
