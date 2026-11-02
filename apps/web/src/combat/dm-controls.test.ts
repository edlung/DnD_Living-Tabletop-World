import { kernelCommandSchema } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { openGroundStart } from './dm-controls.tsx';

describe('openGroundStart', () => {
  it('places the party on the left and others on the right, one per square', () => {
    const combatants = openGroundStart([
      { entityId: 'elowen', side: 'party' },
      { entityId: 'goblin-1', side: 'hostile' },
      { entityId: 'goblin-2', side: 'hostile' },
    ]);
    expect(combatants.map((c) => `${c.entityId}@${c.position.x},${c.position.y}`)).toEqual([
      'elowen@2,1',
      'goblin-1@11,1',
      'goblin-2@11,3',
    ]);
    const command = {
      type: 'StartCombat',
      locationId: 'old-trade-road',
      battlefield: { width: 16, height: 12, difficult: [], cover: [] },
      combatants,
    };
    expect(kernelCommandSchema.safeParse(command).success).toBe(true);
  });

  it('goes on in a second column once a side fills its first (Stage 605)', () => {
    const foes = Array.from({ length: 11 }, (_, index) => ({
      entityId: `foe-${String(index)}`,
      side: 'hostile' as const,
    }));
    const party = ['a', 'b', 'c', 'd'].map((entityId) => ({ entityId, side: 'party' as const }));
    const combatants = openGroundStart([...party, ...foes]);
    const squares = combatants.map((c) => `${String(c.position.x)},${String(c.position.y)}`);
    expect(new Set(squares).size).toBe(15);
    expect(combatants.every((c) => c.position.y <= 11 && c.position.x <= 15)).toBe(true);
    expect(combatants.find((c) => c.entityId === 'foe-6')?.position).toEqual({ x: 12, y: 1 });
  });
});
