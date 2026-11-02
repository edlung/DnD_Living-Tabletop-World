import type { CharacterSheet, CharacterSheetResponse } from '@ltw/contracts';

import { perceivedEntityIds } from '../investigation/perception.ts';
import type { WorldState } from '../kernel/state.ts';
import type { ResolvedPerspective } from '../knowledge/perspective.ts';
import { entityRef, knownEntityIds } from '../knowledge/projection.ts';

/**
 * Full statistics for the DM or the perspective's own character (invariant 19,
 * Character Experience, ADR 0012). Knowing another entity never grants its sheet.
 * The actor's DM role does not override a restricted preview perspective.
 */
export function characterSheetView(
  state: WorldState,
  perspective: ResolvedPerspective,
  entityId: string,
): CharacterSheetResponse | null {
  const dm = perspective.kind === 'DM';
  if (!dm && (perspective.kind !== 'CHARACTER' || perspective.holderId !== entityId)) return null;
  const sheet = state.characterSheets.get(entityId);
  if (!sheet || !state.entities.has(entityId)) return null;
  const known = knownEntityIds(state, perspective);
  const perceived = dm ? new Set<string>() : perceivedEntityIds(state, entityId);
  const visible = (id: string) => dm || known.has(id) || perceived.has(id);
  return {
    perspective: perspective.label,
    entity: entityRef(state, entityId),
    sheet: copySheet(sheet, visible),
  };
}

/** Explicit nested whitelist: future canonical fields cannot silently enter a client response. */
function copySheet(sheet: CharacterSheet, visible: (id: string) => boolean): CharacterSheet {
  const concentration = sheet.concentration;
  return {
    classes: sheet.classes.map(({ classId, level, subclass }) => ({
      classId,
      level,
      ...(subclass === undefined ? {} : { subclass }),
    })),
    abilities: {
      str: sheet.abilities.str,
      dex: sheet.abilities.dex,
      con: sheet.abilities.con,
      int: sheet.abilities.int,
      wis: sheet.abilities.wis,
      cha: sheet.abilities.cha,
    },
    hitPoints: { max: sheet.hitPoints.max, current: sheet.hitPoints.current },
    armorClass: sheet.armorClass,
    speedFt: sheet.speedFt,
    savingThrows: [...sheet.savingThrows],
    skills: { proficient: [...sheet.skills.proficient], expertise: [...sheet.skills.expertise] },
    ...(sheet.fightingStyle === undefined ? {} : { fightingStyle: sheet.fightingStyle }),
    attacksPerAction: sheet.attacksPerAction,
    weapons: [...sheet.weapons],
    spellSlots: { max: [...sheet.spellSlots.max], expended: [...sheet.spellSlots.expended] },
    spellcasting: sheet.spellcasting.map(({ source, ability, spells, freeCasts }) => ({
      source,
      ability,
      spells: [...spells],
      ...(freeCasts === undefined
        ? {}
        : {
            freeCasts: {
              spellId: freeCasts.spellId,
              perLongRest: freeCasts.perLongRest,
              used: freeCasts.used,
            },
          }),
    })),
    conditions: [...sheet.conditions],
    concentration:
      concentration === null
        ? null
        : {
            spellId: concentration.spellId,
            ...(concentration.targetId !== undefined && visible(concentration.targetId)
              ? { targetId: concentration.targetId }
              : {}),
          },
    ...(sheet.deathSaves === undefined
      ? {}
      : {
          deathSaves: {
            successes: sheet.deathSaves.successes,
            failures: sheet.deathSaves.failures,
          },
        }),
    ...(sheet.hitDiceSpent === undefined ? {} : { hitDiceSpent: spentDice(sheet.hitDiceSpent) }),
  };
}

/** Spent Hit Point Dice, by size, field by field. */
function spentDice(
  spent: NonNullable<CharacterSheet['hitDiceSpent']>,
): NonNullable<CharacterSheet['hitDiceSpent']> {
  return {
    ...(spent.d6 === undefined ? {} : { d6: spent.d6 }),
    ...(spent.d8 === undefined ? {} : { d8: spent.d8 }),
    ...(spent.d10 === undefined ? {} : { d10: spent.d10 }),
    ...(spent.d12 === undefined ? {} : { d12: spent.d12 }),
  };
}
