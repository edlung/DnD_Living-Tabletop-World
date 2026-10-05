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
});
