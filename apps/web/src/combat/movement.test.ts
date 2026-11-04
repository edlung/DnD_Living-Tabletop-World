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

describe('planPath over water, heights and in the air (docs/adr/0049-space-and-movement.md §5–6)', () => {
  const mover = (base: EncounterView, patch: Partial<EncounterView['combatants'][number]>) => {
    const [first, ...rest] = base.combatants;
    if (!first) throw new Error('no mover');
    return { ...base, combatants: [{ ...first, ...patch }, ...rest] };
  };

  it('swims at an extra foot per foot without a Swim Speed, at its own cost with one', () => {
    const wet = encounter({ water: [{ x: 0, y: 1 }] });
    expect(planPath(wet, 'a', { x: 0, y: 1 })?.costFt).toBe(10);
    expect(planPath(mover(wet, { speeds: { swim: 30 } }), 'a', { x: 0, y: 1 })?.costFt).toBe(5);
  });

  it('climbs a rise of more than 5 ft at 2 ft a foot, at 1 with a Climb Speed', () => {
    const ledge = encounter({ ground: [{ x: 0, y: 1, ft: 10 }] });
    expect(planPath(ledge, 'a', { x: 0, y: 1 })?.costFt).toBe(25);
    expect(planPath(mover(ledge, { speeds: { climb: 30 } }), 'a', { x: 0, y: 1 })?.costFt).toBe(15);
    // A step of 5 ft is walked.
    expect(
      planPath(encounter({ ground: [{ x: 0, y: 1, ft: 5 }] }), 'a', { x: 0, y: 1 })?.costFt,
    ).toBe(5);
  });

  it('crawls at an extra foot per foot', () => {
    expect(planPath(encounter(), 'a', { x: 0, y: 2 }, true)?.costFt).toBe(20);
  });

  it('flies at its height over a creature below, onto raised ground at that height', () => {
    // b, a hostile, stands at (1, 0); a flies 10 ft up from (0, 0).
    const base = encounter({ ground: [{ x: 3, y: 0, ft: 10 }] });
    const [a, b, c] = base.combatants;
    if (!a || !b || !c) throw new Error('no combatants');
    const view: EncounterView = {
      ...base,
      combatants: [{ ...a, altitudeFt: 10, flies: true }, { ...b, side: 'hostile' }, c],
    };
    const over = planPath(view, 'a', { x: 2, y: 0 });
    expect(over?.path).toEqual([
      { x: 1, y: 0, altitudeFt: 10 },
      { x: 2, y: 0, altitudeFt: 10 },
    ]);
    expect(over?.costFt).toBe(10);
    // The raised square's ground is at its height: it stands there.
    expect(planPath(view, 'a', { x: 3, y: 0 })?.path.at(-1)).toEqual({ x: 3, y: 0 });
    // On the ground it cannot pass the hostile; it goes round.
    const walking = { ...view, combatants: [{ ...a }, { ...b, side: 'hostile' as const }, c] };
    expect(planPath(walking, 'a', { x: 2, y: 0 })?.path).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 0 },
    ]);
  });

  it('keeps a flyer from flying into ground higher than it is', () => {
    const base = encounter({
      ground: [0, 1, 2, 3].map((y) => ({ x: 2, y, ft: 20 })),
    });
    const [a, ...rest] = base.combatants;
    if (!a) throw new Error('no mover');
    const view = { ...base, combatants: [{ ...a, altitudeFt: 10, flies: true as const }, ...rest] };
    expect(planPath(view, 'a', { x: 3, y: 0 })).toBeNull();
  });
});

describe('planPath down a bank into water', () => {
  it('pays for the climb and the swim at once, as the rules do', () => {
    const view = encounter({ ground: [{ x: 0, y: 0, ft: 10 }], water: [{ x: 0, y: 1 }] });
    expect(planPath(view, 'a', { x: 0, y: 1 })?.costFt).toBe(30);
  });
});
