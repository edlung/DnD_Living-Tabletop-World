import {
  HIDDEN_TURN,
  effectiveMaximum,
  type ConditionNoteView,
  type EncounterCombatantView,
  type EncounterView,
  type Battlefield,
} from '@ltw/contracts';
import {
  combatantOf,
  currentCombatant,
  hiddenByFog,
  knownEntityIds,
  projectionPartyMemberIds,
  type ResolvedPerspective,
  type EncounterState,
  type WorldState,
} from '@ltw/domain';
import { encounterDifficulty, formName, totalLevel } from '@ltw/rules';

import { reactionWindowView } from './reactions/view.ts';
import { sensesOf } from './sight.ts';
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
  const language = state.campaign?.language === 'ru' ? 'ru' : 'en';
  const holder = perspective.kind === 'CHARACTER' ? perspective.holderId : null;
  const members = projectionPartyMemberIds(state, perspective);
  const asParty =
    perspective.kind === 'PARTY' && [...members].some((id) => combatantOf(encounter, id));
  if (!dm && !asParty && (holder === null || !combatantOf(encounter, holder))) return null;

  const known = knownEntityIds(state, perspective);
  const party = new Set<string>(holder === null ? [] : [holder]);
  if (asParty || (holder !== null && members.has(holder))) members.forEach((id) => party.add(id));

  // A creature a party character commands is the party's to know, its name too (ADR 0044 §7).
  const ours = new Set(
    encounter.combatants
      .filter(
        (c) => c.commandedBy !== undefined && c.commandedBy !== null && party.has(c.commandedBy),
      )
      .map((c) => c.entityId),
  );
  const knows = (entityId: string) => dm || known.has(entityId) || ours.has(entityId);
  // A creature named in a condition's details (its source, whose turn ends it), as the viewer
  // knows it (docs/adr/0045-conditions-and-actions.md §2).
  const named = (entityId: string) => ({
    entityId,
    name: knows(entityId) ? (state.entities.get(entityId)?.name ?? null) : null,
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

  // The fog of war (docs/adr/0057-encounters-maps-loot.md §4): what it hides, only the DM sees.
  const fogged = (entityId: string) => !dm && !ours.has(entityId) && hiddenByFog(state, entityId);
  const fog = new Set(
    (encounter.battlefield.fog ?? []).map(({ x, y }) => `${String(x)},${String(y)}`),
  );
  const seen = <T extends { readonly x: number; readonly y: number }>(list: readonly T[]) =>
    dm ? list : list.filter(({ x, y }) => !fog.has(`${String(x)},${String(y)}`));
  const combatants = encounter.combatants
    .filter((combatant) => !fogged(combatant.entityId))
    .map((combatant): EncounterCombatantView => {
      const entity = state.entities.get(combatant.entityId);
      const vitals = vitalsOf(state, combatant.entityId);
      if (!entity || !vitals)
        throw new Error(`combatant ${combatant.entityId} lacks canonical data`);
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
          name: knows(entity.entityId) ? entity.name : null,
        },
        side: combatant.side,
        position: { x: combatant.position.x, y: combatant.position.y },
        // Its size and a squeeze, as anyone looking sees (docs/adr/0049-space-and-movement.md §1, §4).
        ...(sizeOf(vitals) === 'medium' ? {} : { size: sizeOf(vitals) }),
        ...(combatant.squeezed === true ? { squeezed: true as const } : {}),
        ...(combatant.altitudeFt === undefined ? {} : { altitudeFt: combatant.altitudeFt }),
        ...(speedsOf(vitals).fly === undefined ? {} : { flies: true as const }),
        // The creature it rides, as anyone sees (§10).
        ...(combatant.mountedOn === undefined ? {} : { mountedOn: named(combatant.mountedOn) }),
        // A Druid's Wild Shape form, as anyone sees it (docs/adr/0056-…md §5).
        ...(vitals.kind === 'character' && vitals.sheet.shape
          ? { form: formName(vitals.sheet.shape.formId, language) }
          : {}),
        // Its speeds beside walking, as its hit points: the party's and the DM's to know (§5).
        ...(showHp && Object.keys(speedsOf(vitals)).length > 0 ? { speeds: speedsOf(vitals) } : {}),
        // Its breath under water, the same way (docs/adr/0050-the-world-around.md §8).
        ...(showHp && combatant.breath
          ? { breath: { roundsLeft: combatant.breath.roundsLeft } }
          : {}),
        // Its legendary actions' attacks, the DM's (docs/adr/0053-monsters-as-data.md §4).
        ...(dm && vitals.kind === 'creature' && vitals.block.legendary
          ? {
              legendary: {
                usesLeft: vitals.block.legendary.uses - (combatant.legendaryUsed ?? 0),
                attacks: vitals.block.legendary.attacks.map((attackId) => ({
                  attackId,
                  name:
                    vitals.block.attacks.find((attack) => attack.attackId === attackId)?.name ??
                    attackId,
                })),
              },
            }
          : {}),
        // Its attacks, for the player whose character commands it to pick (docs/adr/0056-…md §5).
        ...(commanded && vitals.kind === 'creature' && vitals.block.attacks.length > 0
          ? {
              attacks: vitals.block.attacks.map(({ attackId, name, kind }) => ({
                attackId,
                name,
                kind,
              })),
            }
          : {}),
        // Its actions with a save, the DM's to run (docs/adr/0053-monsters-as-data.md §2), and its
        // commander's player's.
        ...((dm || commanded) && vitals.kind === 'creature' && vitals.block.saveActions
          ? {
              creatureActions: vitals.block.saveActions.map((action) => {
                const used = combatant.used?.find((one) => one.actionId === action.actionId);
                return {
                  actionId: action.actionId,
                  name: action.name,
                  ready:
                    !(combatant.spent ?? []).includes(action.actionId) &&
                    (action.perDay === null || (used?.count ?? 0) < action.perDay),
                  aim: action.area === null ? ('creature' as const) : ('square' as const),
                  ...(action.recharge === null ? {} : { recharge: action.recharge }),
                  ...(action.inMultiattack === true ? { inMultiattack: true as const } : {}),
                  ...(action.perDay === null
                    ? {}
                    : { usesLeft: action.perDay - (used?.count ?? 0) }),
                };
              }),
            }
          : {}),
        // Its senses, the same way (docs/adr/0050-the-world-around.md §2).
        ...(showHp && Object.keys(sensesOf(vitals)).length > 0 ? { senses: sensesOf(vitals) } : {}),
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
    currentCombatantId: fogged(current.entityId) ? HIDDEN_TURN : current.entityId,
    order: encounter.combatants.map((c) => c.entityId).filter((id) => !fogged(id)),
    battlefield: {
      width: battlefield.width,
      height: battlefield.height,
      // Under the fog the players see no ground: only that it is hidden.
      difficult: seen(battlefield.difficult).map(({ x, y }) => ({ x, y })),
      cover: seen(battlefield.cover).map(({ x, y, level }) => ({ x, y, level })),
      // Walls, water and the ground's heights (docs/adr/0049-space-and-movement.md §4–6), when the
      // battlefield has any.
      ...(battlefield.walls
        ? { walls: seen(battlefield.walls).map(({ x, y }) => ({ x, y })) }
        : {}),
      ...(battlefield.water
        ? {
            water: seen(battlefield.water).map(({ x, y, deep }) => ({
              x,
              y,
              ...(deep === true ? { deep } : {}),
            })),
          }
        : {}),
      ...(battlefield.ground
        ? { ground: seen(battlefield.ground).map(({ x, y, ft }) => ({ x, y, ft })) }
        : {}),
      // Its light and its fog (docs/adr/0050-the-world-around.md §1), as everyone at the table sees.
      ...(battlefield.ambient ? { ambient: battlefield.ambient } : {}),
      ...(battlefield.light
        ? { light: seen(battlefield.light).map(({ x, y, level }) => ({ x, y, level })) }
        : {}),
      ...(battlefield.obscured
        ? {
            obscured: seen(battlefield.obscured).map(({ x, y, heavy }) => ({
              x,
              y,
              ...(heavy === true ? { heavy } : {}),
            })),
          }
        : {}),
      // The fog of war itself: where it lies is everyone's to see (ADR 0057 §4).
      ...(battlefield.fog && battlefield.fog.length > 0
        ? { fog: battlefield.fog.map(({ x, y }) => ({ x, y })) }
        : {}),
      // Its traps and harmful ground (ADR 0057 §6): a hidden trap is the DM's until it is found
      // or springs; under the fog the table sees neither.
      ...traps(battlefield.traps, dm, seen),
      ...(battlefield.hazards
        ? {
            hazards: seen(battlefield.hazards).map(({ x, y, hazard }) => ({
              x,
              y,
              hazard: structuredClone(hazard),
            })),
          }
        : {}),
    },
    combatants,
    reactionWindow: reactionWindowView(state, { dm, holder, known }),
    ...(dm ? difficultyOf(state, encounter) : {}),
  };
}

/** The traps a viewer sees (ADR 0057 §6): all for the DM; for the table, those known and in sight. */
function traps(
  list: Battlefield['traps'],
  dm: boolean,
  seen: <T extends { readonly x: number; readonly y: number }>(
    squares: readonly T[],
  ) => readonly T[],
): Pick<Battlefield, 'traps'> {
  if (!list) return {};
  const shown = list
    .filter((trap) => dm || !trap.hidden || trap.found === true)
    .map((trap) => ({
      ...structuredClone(trap),
      squares: seen(trap.squares).map(({ x, y }) => ({ x, y })),
    }))
    .filter((trap) => trap.squares.length > 0);
  return { traps: shown };
}

/**
 * The fight's difficulty for the DM (docs/adr/0053-monsters-as-data.md §3): the party's characters'
 * levels against the XP of the living foes whose stat blocks name it.
 */
function difficultyOf(
  state: WorldState,
  encounter: EncounterState,
): { difficulty?: NonNullable<EncounterView['difficulty']> } {
  const levels: number[] = [];
  let xp = 0;
  let unknown = 0;
  for (const combatant of encounter.combatants) {
    const vitals = vitalsOf(state, combatant.entityId);
    if (!vitals || state.entities.get(combatant.entityId)?.status !== 'active') continue;
    if (combatant.side === 'party' && vitals.kind === 'character')
      levels.push(totalLevel(vitals.sheet));
    if (combatant.side === 'hostile' && vitals.kind === 'creature' && !vitals.block.object) {
      if (vitals.block.challenge) xp += vitals.block.challenge.xp;
      else unknown += 1;
    }
  }
  if (levels.length === 0 || xp + unknown === 0) return {};
  return { difficulty: { ...encounterDifficulty(levels, xp), unknown } };
}
