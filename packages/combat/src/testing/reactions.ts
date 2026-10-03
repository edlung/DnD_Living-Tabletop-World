import type { CommandResult } from '@ltw/contracts';
import type { Actor } from '@ltw/domain';

import { ELOWEN, SHAMAN, openWindowId, type RoadWorld, type AMBUSH } from './road.ts';

/**
 * Test support for reaction windows (docs/adr/0016-reaction-engine.md). Seren
 * is a test-only second character with Elowen's sheet (so she knows
 * Counterspell), controlled by her own player: two candidates per window.
 */
export const SEREN = 'seren-ashgrove';
export const SEREN_PLAYER: Actor = { actorId: 'player-seren', kind: 'user' };

/** Creates Seren on the Old Trade Road with her own player. */
export async function addSeren(world: RoadWorld): Promise<void> {
  const sheet = (await world.state()).characterSheets.get(ELOWEN);
  if (!sheet) throw new Error('Elowen has no sheet');
  for (const command of [
    {
      type: 'CreateEntity',
      entityId: SEREN,
      kind: 'character',
      name: 'Seren Ashgrove',
      existsSince: null,
      placement: { locationId: 'old-trade-road', since: null },
    },
    { type: 'SetCharacterSheet', entityId: SEREN, sheet: structuredClone(sheet) },
    { type: 'AssignCharacter', characterId: SEREN, playerActorId: SEREN_PLAYER.actorId },
  ]) {
    const result = await world.dm(command);
    if (result.status === 'rejected') throw new Error(`Seren setup rejected: ${result.code}`);
  }
}

/** `startAmbush` changes that add Seren to the party at `position`. */
export const withSeren =
  (position = { x: 2, y: 8 }) =>
  (command: typeof AMBUSH.startCombat): Record<string, unknown> => ({
    ...command,
    combatants: [...command.combatants, { entityId: SEREN, side: 'party', position }],
  });

export const cast = (
  combatantId: string,
  spellId: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({ type: 'CastSpell', combatantId, spellId, ...extra });

/** Elowen ends her turn and the Shaman casts at her: a Counterspell window opens. */
export async function shamanCastsAtElowen(
  world: RoadWorld,
  spellId = 'ashen-bolt',
): Promise<{ readonly trigger: CommandResult; readonly windowId: string }> {
  await world.dm({ type: 'EndTurn', combatantId: ELOWEN });
  const trigger = await world.dm(cast(SHAMAN, spellId, { targetId: ELOWEN }));
  return { trigger, windowId: await openWindowId(world) };
}

export const counterspell = (
  combatantId: string,
  windowId: string,
  using?: { readonly slotLevel: number },
): Record<string, unknown> => ({
  type: 'UseReaction',
  combatantId,
  windowId,
  reaction: 'counterspell',
  ...(using ? { using } : {}),
});

export const ignore = (combatantId: string, windowId: string): Record<string, unknown> => ({
  type: 'DeclineReaction',
  combatantId,
  windowId,
});

export const closeWindow = (windowId: string): Record<string, unknown> => ({
  type: 'CloseReactionWindow',
  windowId,
});
