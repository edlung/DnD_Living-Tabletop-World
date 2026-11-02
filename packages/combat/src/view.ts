import type { ConditionNoteView, EncounterCombatantView, EncounterView } from '@ltw/contracts';
import {
  combatantOf,
  currentCombatant,
  knownEntityIds,
  projectionPartyMemberIds,
  type ResolvedPerspective,
  type WorldState,
} from '@ltw/domain';

import { reactionWindowView } from './reactions/view.ts';
import { conditionsOf, exhaustionOf, hitPoints, vitalsOf } from './vitals.ts';

/**
 * The encounter as a perspective sees it (docs/adr/0015-combat-engine.md §6).
 * The DM sees everything. A character taking part sees the battlefield, turn
 * order, every combatant's square, side, conditions (with Exhaustion's level and
 * how each ends, ADR 0045) and whether it is up, down or dead; names only when
 * known; hit points only of the party.
 * Initiative rolls and stat blocks are DM data. The party, while one of its
 * members takes part, sees what such a member sees with the party's knowledge
 * and nothing of one character's own: no reaction window (the table's display,
 * docs/adr/0042-table-display.md §3). Any other perspective (public, NPC, a
 * character not in the fight) sees no encounter. Built field by field:
 * canonical objects are never passed through.
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
  const members = projectionPartyMemberIds(state, perspective);
  const asParty =
    perspective.kind === 'PARTY' && [...members].some((id) => combatantOf(encounter, id));
  if (!dm && !asParty && (holder === null || !combatantOf(encounter, holder))) return null;

  const known = knownEntityIds(state, perspective);
  const party = new Set<string>(holder === null ? [] : [holder]);
  if (asParty || (holder !== null && members.has(holder))) members.forEach((id) => party.add(id));

  // A creature named in a condition's details (its source, whose turn ends it), as the viewer
  // knows it (docs/adr/0045-conditions-and-actions.md §2).
  const named = (entityId: string) => ({
    entityId,
    name: dm || known.has(entityId) ? (state.entities.get(entityId)?.name ?? null) : null,
  });
  const notesOf = (combatant: (typeof encounter.combatants)[number]): ConditionNoteView[] =>
    (combatant.conditionDetails ?? []).map(({ condition, sourceId, until, save }) => ({
      condition,
      ...(sourceId === undefined ? {} : { source: named(sourceId) }),
      ...(until
        ? { until: { turnOf: named(until.turnOf), at: until.at, turns: until.turns } }
        : {}),
      ...(save ? { save: { ability: save.ability, dc: save.dc } } : {}),
    }));

  const combatants = encounter.combatants.map((combatant): EncounterCombatantView => {
    const entity = state.entities.get(combatant.entityId);
    const vitals = vitalsOf(state, combatant.entityId);
    if (!entity || !vitals) throw new Error(`combatant ${combatant.entityId} lacks canonical data`);
    const hp = hitPoints(vitals);
    // A creature a party character commands (ADR 0044 §7) is the party's to know, as its own.
    const commander = combatant.commandedBy ?? null;
    const commanded = commander !== null && (dm || party.has(commander));
    const showHp =
      dm || commanded || (vitals.kind === 'character' && party.has(combatant.entityId));
    const { roll, modifier, total, surprised } = combatant.initiative;
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
      ...(exhaustionOf(vitals) > 0 ? { exhaustion: exhaustionOf(vitals) } : {}),
      ...(notesOf(combatant).length > 0 ? { conditionNotes: notesOf(combatant) } : {}),
      ...(showHp ? { hitPoints: { current: hp.current, max: hp.max } } : {}),
      ...(commanded
        ? {
            commandedBy: {
              entityId: commander,
              name:
                dm || known.has(commander) ? (state.entities.get(commander)?.name ?? null) : null,
            },
          }
        : {}),
      ...(dm ? { initiative: { roll, modifier, total, ...(surprised ? { surprised } : {}) } } : {}),
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
