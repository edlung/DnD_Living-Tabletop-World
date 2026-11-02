import type { PerspectiveRequest } from '@ltw/contracts';
import { resolvePerspective, type Actor, type WorldState } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { shamanCastsAtElowen } from './testing/reactions.ts';
import { DM, ELOWEN, PLAYER, RAIDER_1, roadWorld, startAmbush } from './testing/road.ts';
import { encounterView } from './view.ts';

/**
 * The fight as the party sees it (docs/adr/0042-table-display.md §3, amending ADR 0015 §6): what
 * the table's display shows. A party member's view with the party's knowledge, and nothing of one
 * character's own; no encounter for the public.
 */
const DISPLAY: Actor = { actorId: 'display:5b1f3c9e-2d4a-4f6b-8c7d-9e0a1b2c3d4e', kind: 'display' };

function seen(state: WorldState, actor: Actor, request: PerspectiveRequest) {
  const access = resolvePerspective(state, actor, request);
  if (!access.ok) throw new Error(access.reason);
  return encounterView(state, access.perspective);
}

describe('the party’s view of a fight', () => {
  it('is a taking-part member’s view without the member’s own window or the DM’s rolls', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await shamanCastsAtElowen(world);
    const state = await world.state();
    const elowen = seen(state, PLAYER, { kind: 'PLAYER' });
    const party = seen(state, PLAYER, { kind: 'PARTY' });
    if (!elowen || !party) throw new Error('both see the fight');
    // Elowen's player is asked to react; the party's screen is not.
    expect(elowen.reactionWindow).not.toBeNull();
    expect(party.reactionWindow).toBeNull();
    expect(party.order).toEqual(elowen.order);
    expect(party.battlefield).toEqual(elowen.battlefield);
    for (const combatant of party.combatants) {
      const hers = elowen.combatants.find((c) => c.entity.entityId === combatant.entity.entityId);
      expect(combatant.position).toEqual(hers?.position);
      expect(combatant.state).toBe(hers?.state);
      // A name only where the party knows it, and never one Elowen does not.
      if (combatant.entity.name !== null) expect(combatant.entity.name).toBe(hers?.entity.name);
      expect('initiative' in combatant).toBe(false);
    }
    const of = (id: string) => party.combatants.find((c) => c.entity.entityId === id);
    expect(of(ELOWEN)?.hitPoints).toBeDefined();
    expect(of(RAIDER_1)?.hitPoints).toBeUndefined();
    // The table's display sees the same; the public sees no fight; the DM still sees it all.
    expect(seen(state, DISPLAY, { kind: 'PARTY' })).toEqual(party);
    expect(seen(state, PLAYER, { kind: 'PUBLIC' })).toBeNull();
    expect(seen(state, DM, { kind: 'DM' })?.combatants.every((c) => 'initiative' in c)).toBe(true);
  });
});
