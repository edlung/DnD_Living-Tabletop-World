import {
  CLASS_RESOURCES,
  type CharacterSheet,
  type CharacterSheetResponse,
  type FeatureUses,
} from '@ltw/contracts';

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
    sheet: copySheet(sheet, visible, dm),
  };
}

/** Explicit nested whitelist: future canonical fields cannot silently enter a client response. */
function copySheet(
  sheet: CharacterSheet,
  visible: (id: string) => boolean,
  dm: boolean,
): CharacterSheet {
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
    hitPoints: {
      max: sheet.hitPoints.max,
      current: sheet.hitPoints.current,
      ...(sheet.hitPoints.temporary === undefined ? {} : { temporary: sheet.hitPoints.temporary }),
      ...(sheet.hitPoints.reducedBy === undefined ? {} : { reducedBy: sheet.hitPoints.reducedBy }),
    },
    armorClass: sheet.armorClass,
    speedFt: sheet.speedFt,
    savingThrows: [...sheet.savingThrows],
    skills: { proficient: [...sheet.skills.proficient], expertise: [...sheet.skills.expertise] },
    ...(sheet.fightingStyle === undefined ? {} : { fightingStyle: sheet.fightingStyle }),
    // A built character's origin, feats, tools and level 1 choices (docs/adr/0056-…md §2).
    ...(sheet.origin === undefined ? {} : { origin: { ...sheet.origin } }),
    ...(sheet.feats === undefined ? {} : { feats: [...sheet.feats] }),
    ...(sheet.experience === undefined ? {} : { experience: sheet.experience }),
    ...(sheet.pendingLevels === undefined ? {} : { pendingLevels: sheet.pendingLevels }),
    ...(sheet.tools === undefined ? {} : { tools: [...sheet.tools] }),
    ...(sheet.classChoices === undefined
      ? {}
      : {
          classChoices: {
            ...(sheet.classChoices.order === undefined ? {} : { order: sheet.classChoices.order }),
            ...(sheet.classChoices.invocations === undefined
              ? {}
              : { invocations: [...sheet.classChoices.invocations] }),
            ...(sheet.classChoices.metamagic === undefined
              ? {}
              : { metamagic: [...sheet.classChoices.metamagic] }),
            ...(sheet.classChoices.spellbook === undefined
              ? {}
              : { spellbook: [...sheet.classChoices.spellbook] }),
          },
        }),
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
    ...(sheet.exhaustion === undefined ? {} : { exhaustion: sheet.exhaustion }),
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
    ...(sheet.heroicInspiration === true ? { heroicInspiration: true } : {}),
    // The class features spent, a Rage, a Bardic Inspiration die held (docs/adr/0056-…md §4).
    ...(sheet.featureUses === undefined ? {} : { featureUses: usesOf(sheet.featureUses) }),
    ...(sheet.raging === undefined ? {} : { raging: { since: sheet.raging.since } }),
    ...(sheet.inspirationDie === undefined
      ? {}
      : {
          inspirationDie: {
            sides: sheet.inspirationDie.sides,
            fromId: sheet.inspirationDie.fromId,
            until: sheet.inspirationDie.until,
          },
        }),
    ...contagionsSeen(sheet, dm),
  };
}

/**
 * The magical contagions it carries (docs/adr/0055-rules-reference-and-toolbox.md §4): the DM
 * sees each from its infection; its carrier only once it has taken hold — until then, nothing is
 * felt.
 */
function contagionsSeen(sheet: CharacterSheet, dm: boolean): Pick<CharacterSheet, 'contagions'> {
  const seen = (sheet.contagions ?? [])
    .filter((one) => dm || one.takenHold)
    .map(({ contagionId, takenHold, successes }) => ({ contagionId, takenHold, successes }));
  return seen.length === 0 ? {} : { contagions: seen };
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

/** The class features spent, resource by resource. */
function usesOf(uses: NonNullable<CharacterSheet['featureUses']>): FeatureUses {
  return Object.fromEntries(
    CLASS_RESOURCES.flatMap((resource) => {
      const used = uses[resource];
      return used === undefined ? [] : [[resource, used]];
    }),
  );
}
