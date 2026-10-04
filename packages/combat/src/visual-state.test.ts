import { entityPresentationAt, worldTimeAt, type ResolvedPerspective } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { CAMPAIGN, ELOWEN, RAIDER_1, RAIDER_2, roadWorld, startAmbush } from './testing/road.ts';

/**
 * Damage and death in world visual state (docs/adr/0023-world-visual-state.md
 * §2): how the road ambush looks resolves from the combat events in effect
 * at each world time, and an undone hit never shows.
 */
const DM_VIEW: ResolvedPerspective = { label: 'DM', kind: 'DM', holderId: null, scopes: 'ALL' };
const shoot = (targetId: string) => ({
  type: 'Attack',
  combatantId: ELOWEN,
  attackId: 'longbow',
  targetId,
});

describe('the road ambush, as it looked', () => {
  it('shows wounds and death from the time they happened, never before', async () => {
    const world = await roadWorld();
    const before = (await world.state()).clock;
    await world.dm({ type: 'AdvanceWorldTime', to: worldTimeAt(1, 14) });
    await startAmbush(world);
    world.roll(20, 6);
    world.roll(8, 2);
    await world.submit(shoot(RAIDER_1));
    world.roll(20, 20);
    world.roll(8, 3, 3);
    await world.submit(shoot(RAIDER_2));

    const snapshot = await world.engine.load(CAMPAIGN);
    if (!snapshot) throw new Error('missing campaign');
    const look = (entityId: string, time: number | null) =>
      entityPresentationAt(snapshot, DM_VIEW, entityId, time)?.presentation;

    expect(look(RAIDER_1, null)).toMatchObject({
      status: 'active',
      vitals: { wounded: true, unconscious: false },
      equipment: expect.arrayContaining([expect.any(String)]) as string[],
    });
    expect(look(RAIDER_1, null)?.tags).toContain('wounded');
    expect(look(RAIDER_2, null)).toMatchObject({ status: 'dead', vitals: null });
    expect(look(RAIDER_2, null)?.tags).toContain('dead');
    expect(look(ELOWEN, null)).toMatchObject({ equipment: ['longbow'] });

    for (const raider of [RAIDER_1, RAIDER_2]) {
      expect(look(raider, before)).toMatchObject({
        status: 'active',
        vitals: { wounded: false, unconscious: false },
      });
    }
  });

  it('forgets an undone hit', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    world.roll(20, 6);
    world.roll(8, 2);
    const hit = await world.submit(shoot(RAIDER_1));
    const undone = await world.dm({ type: 'UndoCommand', targetCommandId: hit.commandId });
    expect(undone.status).toBe('accepted');
    const snapshot = await world.engine.load(CAMPAIGN);
    if (!snapshot) throw new Error('missing campaign');
    expect(entityPresentationAt(snapshot, DM_VIEW, RAIDER_1, null)?.presentation.vitals).toEqual({
      wounded: false,
      unconscious: false,
    });
  });
});
