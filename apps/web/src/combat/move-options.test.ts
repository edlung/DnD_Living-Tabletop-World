import type { EncounterCombatantView, EncounterView } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { flightMoves, occupantAt, squareMoves } from './move-options.ts';

/** A on (1, 1) of a 8 × 4 field (docs/adr/0049-space-and-movement.md §5–8). */
function encounter(
  battlefield: Partial<EncounterView['battlefield']> = {},
  self: Partial<EncounterCombatantView> = {},
  others: readonly EncounterCombatantView[] = [],
): EncounterView {
  return {
    encounterId: 'e1',
    locationId: 'old-trade-road',
    round: 1,
    currentCombatantId: 'a',
    order: ['a'],
    battlefield: { width: 8, height: 4, difficult: [], cover: [], ...battlefield },
    combatants: [
      {
        entity: { entityId: 'a', kind: 'character', name: 'A' },
        side: 'party',
        position: { x: 1, y: 1 },
        state: 'up',
        conditions: [],
        ...self,
      },
      ...others,
    ],
    reactionWindow: null,
  };
}

const kinds = (view: EncounterView, x: number, y: number) =>
  squareMoves(view, 'a', { x, y }).map((option) => option.kind);

describe('squareMoves', () => {
  it('offers the route alone on open ground, and nothing on its own square', () => {
    expect(kinds(encounter(), 3, 1)).toEqual(['move']);
    expect(kinds(encounter(), 1, 1)).toEqual([]);
  });

  it('offers a crawl beside the walk while Prone', () => {
    const prone = encounter({}, { conditions: ['prone'] });
    const moves = squareMoves(prone, 'a', { x: 2, y: 1 });
    expect(moves.map((option) => option.kind)).toEqual(['move', 'crawl']);
    expect(moves[1]).toMatchObject({ crawl: true, costFt: 10 });
  });

  it('offers a drop beside a ledge, a fall of the difference', () => {
    // It stands 10 ft up on (1, 1); (2, 1) is level ground.
    const ledge = encounter({ ground: [{ x: 1, y: 1, ft: 10 }] });
    const drop = squareMoves(ledge, 'a', { x: 2, y: 1 }).find((option) => option.kind === 'drop');
    expect(drop).toMatchObject({ path: [{ x: 2, y: 1, drop: true }], fallFt: 10, costFt: 5 });
  });

  it('offers a jump over a pit in a straight line, never over plain ground', () => {
    const pit = encounter({ ground: [{ x: 2, y: 1, ft: -10 }] });
    const jump = squareMoves(pit, 'a', { x: 3, y: 1 }).find((option) => option.kind === 'jump');
    expect(jump?.path).toEqual([
      { x: 2, y: 1, jump: true },
      { x: 3, y: 1, jump: true },
    ]);
    expect(jump?.costFt).toBe(10);
    expect(kinds(encounter(), 3, 1)).not.toContain('jump');
    // Not along a knight's move, and not through someone.
    expect(kinds(pit, 3, 2)).not.toContain('jump');
    const blocked = encounter({ ground: [{ x: 2, y: 1, ft: -10 }] }, {}, [
      {
        entity: { entityId: 'b', kind: 'creature', name: null },
        side: 'hostile',
        position: { x: 3, y: 1 },
        state: 'up',
        conditions: [],
      },
    ]);
    expect(kinds(blocked, 3, 1)).not.toContain('jump');
  });

  it('flies to a square at its height, and offers to land there', () => {
    const aloft = encounter({}, { altitudeFt: 10, flies: true });
    const moves = squareMoves(aloft, 'a', { x: 2, y: 1 });
    expect(moves.map((option) => option.kind)).toEqual(['move', 'land']);
    expect(moves[0]?.path).toEqual([{ x: 2, y: 1, altitudeFt: 10 }]);
    expect(moves[1]?.path).toEqual([
      { x: 2, y: 1, altitudeFt: 10 },
      { x: 2, y: 1, altitudeFt: 5 },
      { x: 2, y: 1 },
    ]);
    expect(moves[1]?.costFt).toBe(15);
  });
});

describe('flightMoves', () => {
  it('rises 10 ft and comes down 10 ft for a flyer; nothing for one without wings', () => {
    expect(flightMoves(encounter(), 'a')).toEqual([]);
    const grounded = flightMoves(encounter({}, { flies: true }), 'a');
    expect(grounded.map((option) => option.kind)).toEqual(['rise']);
    expect(grounded[0]?.path).toEqual([
      { x: 1, y: 1, altitudeFt: 5 },
      { x: 1, y: 1, altitudeFt: 10 },
    ]);
    const high = flightMoves(encounter({}, { flies: true, altitudeFt: 15 }), 'a');
    expect(high.find((option) => option.kind === 'descend')).toMatchObject({
      path: [
        { x: 1, y: 1, altitudeFt: 10 },
        { x: 1, y: 1, altitudeFt: 5 },
      ],
      costFt: 10,
    });
    const low = flightMoves(encounter({}, { flies: true, altitudeFt: 5 }), 'a');
    expect(low.find((option) => option.kind === 'descend')).toMatchObject({
      path: [{ x: 1, y: 1 }],
      costFt: 5,
    });
  });
});

describe('occupantAt', () => {
  it('finds a Large creature from any square of its space', () => {
    const view = encounter({}, {}, [
      {
        entity: { entityId: 'ogre', kind: 'creature', name: null },
        side: 'hostile',
        position: { x: 4, y: 1 },
        size: 'large',
        state: 'up',
        conditions: [],
      },
    ]);
    expect(occupantAt(view, { x: 5, y: 2 })?.entity.entityId).toBe('ogre');
    expect(occupantAt(view, { x: 6, y: 2 })).toBeNull();
  });
});
