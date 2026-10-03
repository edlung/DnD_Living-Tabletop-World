import type { EncounterCombatantView, EncounterView } from '@ltw/contracts';
import {
  combatantOf,
  currentCombatant,
  knownEntityIds,
  type ResolvedPerspective,
  type WorldState,
} from '@ltw/domain';

import { reactionWindowView } from './reactions/view.ts';
import { conditionsOf, hitPoints, vitalsOf } from './vitals.ts';

/**
 * The encounter as a perspective sees it (docs/adr/0015-combat-engine.md §6).
 * The DM sees everything. A character taking part sees the battlefield, turn
 * order, every combatant's square, side, conditions and whether it is up,
 * down or dead; names only when known; hit points only of the party.
 * Initiative rolls and stat blocks are DM data. Any other perspective
 * (party, public, NPC, a character not in the fight) sees no encounter.
 * Built field by field: canonical objects are never passed through.
 */
export function encounterView(
  state: WorldState,
  perspective: ResolvedPerspective,
): EncounterView | null {
  const encounter = state.encounter;
  const current = encounter ? currentCombatant(encounter) : undefined;
  if (!encounter || !current) return null;
  const dm = perspective.kind === 'DM';
  const holder = perspective.kind === 'CHARACTER' ? perspective.holderId : null;
  if (!dm && (holder === null || !combatantOf(encounter, holder))) return null;

  const known = knownEntityIds(state, perspective);
  const party = new Set<string>(holder === null ? [] : [holder]);
  if (holder !== null && state.roster.has(holder)) state.roster.forEach((_, id) => party.add(id));

  const combatants = encounter.combatants.map((combatant): EncounterCombatantView => {
    const entity = state.entities.get(combatant.entityId);
    const vitals = vitalsOf(state, combatant.entityId);
    if (!entity || !vitals) throw new Error(`combatant ${combatant.entityId} lacks canonical data`);
    const hp = hitPoints(vitals);
    const showHp = dm || (vitals.kind === 'character' && party.has(combatant.entityId));
    const { roll, modifier, total } = combatant.initiative;
    return {
      entity: {
        entityId: entity.entityId,
        kind: entity.kind,
        name: dm || known.has(entity.entityId) ? entity.name : null,
      },
      side: combatant.side,
      position: { x: combatant.position.x, y: combatant.position.y },
      state: entity.status !== 'active' ? 'dead' : hp.current === 0 ? 'down' : 'up',
      conditions: [...conditionsOf(vitals)],
      ...(showHp ? { hitPoints: { current: hp.current, max: hp.max } } : {}),
      ...(dm ? { initiative: { roll, modifier, total } } : {}),
    };
  });
  const { battlefield } = encounter;
  return {
    encounterId: encounter.encounterId,
    round: encounter.round,
    currentCombatantId: current.entityId,
    order: encounter.combatants.map((c) => c.entityId),
    battlefield: {
      width: battlefield.width,
      height: battlefield.height,
      difficult: battlefield.difficult.map(({ x, y }) => ({ x, y })),
      cover: battlefield.cover.map(({ x, y, level }) => ({ x, y, level })),
    },
    combatants,
    reactionWindow: reactionWindowView(state, { dm, holder, known }),
  };
}
