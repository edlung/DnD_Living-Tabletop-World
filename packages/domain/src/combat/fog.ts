import type { WorldState } from '../kernel/state.ts';

/**
 * The fog of war (docs/adr/0057-encounters-maps-loot.md §4): a combatant of the running fight the
 * DM's fog hides from the players and the table's display — not of the party's side, commanded by
 * no one, its whole space in fogged squares. The DM sees through it; perception and every view
 * built on it leave such a creature out.
 */
const SPAN: Readonly<Record<string, number>> = { large: 2, huge: 3, gargantuan: 4 };

export function hiddenByFog(state: WorldState, entityId: string): boolean {
  const encounter = state.encounter;
  const fog = encounter?.battlefield.fog;
  if (!encounter || !fog || fog.length === 0) return false;
  const combatant = encounter.combatants.find((one) => one.entityId === entityId);
  if (!combatant || combatant.side === 'party' || combatant.commandedBy) return false;
  const span = SPAN[state.statBlocks.get(entityId)?.size ?? 'medium'] ?? 1;
  const hidden = new Set(fog.map((square) => `${String(square.x)},${String(square.y)}`));
  for (let dy = 0; dy < span; dy += 1)
    for (let dx = 0; dx < span; dx += 1)
      if (!hidden.has(`${String(combatant.position.x + dx)},${String(combatant.position.y + dy)}`))
        return false;
  return true;
}
