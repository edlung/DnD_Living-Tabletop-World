import {
  effectiveMaximum,
  type ConditionNoteView,
  type EncounterCombatantView,
  type EncounterView,
} from '@ltw/contracts';
import {
  combatantOf,
  currentCombatant,
  knownEntityIds,
  projectionPartyMemberIds,
  type ResolvedPerspective,
  type WorldState,
} from '@ltw/domain';

import { reactionWindowView } from './reactions/view.ts';
import {
  conditionsOf,
  exhaustionOf,
  has,
  hitPoints,
  knockedOutOf,
  sizeOf,
  speedsOf,
  vitalsOf,
} from './vitals.ts';

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
    const thing = vitals.kind === 'creature' ? vitals.block.object : undefined;
    return {
      entity: {
        entityId: entity.entityId,
        kind: entity.kind,
        name: dm || known.has(entity.entityId) ? entity.name : null,
      },
      side: combatant.side,
      position: { x: combatant.position.x, y: combatant.position.y },
      // Its size and a squeeze, as anyone looking sees (docs/adr/0049-space-and-movement.md §1, §4).
      ...(sizeOf(vitals) === 'medium' ? {} : { size: sizeOf(vitals) }),
      ...(combatant.squeezed === true ? { squeezed: true as const } : {}),
      ...(combatant.altitudeFt === undefined ? {} : { altitudeFt: combatant.altitudeFt }),
      ...(speedsOf(vitals).fly === undefined ? {} : { flies: true as const }),
      // Its speeds beside walking, as its hit points: the party's and the DM's to know (§5).
      ...(showHp && Object.keys(speedsOf(vitals)).length > 0 ? { speeds: speedsOf(vitals) } : {}),
      // Knocked out, it is down as the dying are (docs/adr/0048-hit-points.md §4).
      state:
        entity.status !== 'active'
          ? 'dead'
          : hp.current === 0 || (knockedOutOf(vitals) && has(vitals, 'unconscious'))
            ? 'down'
            : 'up',
      conditions: [...conditionsOf(vitals)],
      ...(exhaustionOf(vitals) > 0 ? { exhaustion: exhaustionOf(vitals) } : {}),
      ...(notesOf(combatant).length > 0 ? { conditionNotes: notesOf(combatant) } : {}),
      ...(showHp
        ? {
            hitPoints: {
              current: hp.current,
              max: effectiveMaximum(hp),
              ...(hp.temporary === undefined ? {} : { temporary: hp.temporary }),
            },
          }
        : {}),
      ...(commanded
        ? {
            commandedBy: {
              entityId: commander,
              name:
                dm || known.has(commander) ? (state.entities.get(commander)?.name ?? null) : null,
            },
          }
        : {}),
      // The attack it readied: the DM's to see, and its own player's (ADR 0046 §5).
      ...(combatant.turn.readied && (dm || combatant.entityId === holder)
        ? {
            readied: {
              target: named(combatant.turn.readied.targetId),
              attackId: combatant.turn.readied.attackId,
              trigger: combatant.turn.readied.trigger,
            },
          }
        : {}),
      ...(dm && thing === undefined
        ? { initiative: { roll, modifier, total, ...(surprised ? { surprised } : {}) } }
        : {}),
      // An object (docs/adr/0048-hit-points.md §5): what it is made of shows; it has no turn.
      ...(thing === undefined ? {} : { object: { material: thing.material, size: thing.size } }),
    };
  });
  const { battlefield } = encounter;
  return {
    encounterId: encounter.encounterId,
    locationId: encounter.locationId,
    round: encounter.round,
    currentCombatantId: current.entityId,
    order: encounter.combatants.map((c) => c.entityId),
    battlefield: {
      width: battlefield.width,
      height: battlefield.height,
      difficult: battlefield.difficult.map(({ x, y }) => ({ x, y })),
      cover: battlefield.cover.map(({ x, y, level }) => ({ x, y, level })),
      // Walls, water and the ground's heights (docs/adr/0049-space-and-movement.md §4–6), when the
      // battlefield has any.
      ...(battlefield.walls ? { walls: battlefield.walls.map(({ x, y }) => ({ x, y })) } : {}),
      ...(battlefield.water
        ? {
            water: battlefield.water.map(({ x, y, deep }) => ({
              x,
              y,
              ...(deep === true ? { deep } : {}),
            })),
          }
        : {}),
      ...(battlefield.ground
        ? { ground: battlefield.ground.map(({ x, y, ft }) => ({ x, y, ft })) }
        : {}),
    },
    combatants,
    reactionWindow: reactionWindowView(state, { dm, holder, known }),
  };
}
