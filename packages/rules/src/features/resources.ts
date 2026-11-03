import {
  CLASS_RESOURCES,
  type CharacterSheet,
  type ClassId,
  type ClassResource,
  type FeatureUses,
  type ResourceCost,
  type ResourceRecharge,
  type ResourceView,
  type SrdClass,
} from '@ltw/contracts';

import { classCasting } from '../builder/spells.ts';
import { abilityModifier } from '../character-math.ts';
import { classColumn, srdClass } from '../srd/classes.ts';

/**
 * The class resources (SRD 5.2.1; docs/adr/0056-characters-from-the-srd.md §4): the uses or points
 * a character has at its class's level — the features table's column where it has one, else the
 * feature's words — what a use costs in a fight, and the rest that gives them back: one use at a
 * Short Rest and all at a Long Rest (Rage, Channel Divinity, Wild Shape, Second Wind), all at
 * either (Action Surge, Focus, and Bardic Inspiration from Font of Inspiration), or all at a Long
 * Rest.
 */
interface ResourceRule {
  readonly classes: readonly ClassId[];
  readonly count: (level: number, sheet: CharacterSheet, cls: SrdClass) => number;
  readonly unit: 'uses' | 'points';
  readonly cost: ResourceCost;
  readonly recharge: (level: number) => ResourceRecharge;
}

const fromColumn =
  (name: string) =>
  (level: number, _sheet: CharacterSheet, cls: SrdClass): number =>
    classColumn(cls, name, level);
/** A count that grows at the levels given: [[from, count], …]. */
const byLevel =
  (steps: readonly (readonly [number, number])[]) =>
  (level: number): number =>
    steps.reduce((count, [from, value]) => (level >= from ? value : count), 0);
const uses = (
  classes: readonly ClassId[],
  count: ResourceRule['count'],
  cost: ResourceCost,
  recharge: ResourceRecharge | ((level: number) => ResourceRecharge),
): ResourceRule => ({
  classes,
  count,
  unit: 'uses',
  cost,
  recharge: typeof recharge === 'string' ? () => recharge : recharge,
});

export const RESOURCE_RULES: Readonly<Record<ClassResource, ResourceRule>> = {
  rage: uses(['barbarian'], fromColumn('Rages'), 'bonus', 'short-one'),
  // As many as the Charisma modifier, at least one; Font of Inspiration's Short Rest from 5.
  'bardic-inspiration': uses(
    ['bard'],
    (_level, sheet) => Math.max(1, abilityModifier(sheet.abilities.cha)),
    'bonus',
    (level) => (level >= 5 ? 'short-all' : 'long'),
  ),
  'channel-divinity': uses(
    ['cleric', 'paladin'],
    fromColumn('Channel Divinity'),
    'action',
    'short-one',
  ),
  'wild-shape': uses(['druid'], fromColumn('Wild Shape'), 'bonus', 'short-one'),
  'second-wind': uses(['fighter'], fromColumn('Second Wind'), 'bonus', 'short-one'),
  // Twice from 17, once on a turn.
  'action-surge': uses(
    ['fighter'],
    byLevel([
      [2, 1],
      [17, 2],
    ]),
    'none',
    'short-all',
  ),
  indomitable: uses(
    ['fighter'],
    byLevel([
      [9, 1],
      [13, 2],
      [17, 3],
    ]),
    'none',
    'long',
  ),
  focus: {
    classes: ['monk'],
    count: fromColumn('Focus Points'),
    unit: 'points',
    cost: 'bonus',
    recharge: () => 'short-all',
  },
  // A pool of five times the Paladin level.
  'lay-on-hands': {
    classes: ['paladin'],
    count: (level) => 5 * level,
    unit: 'points',
    cost: 'bonus',
    recharge: () => 'long',
  },
  'sorcery-points': {
    classes: ['sorcerer'],
    count: fromColumn('Sorcery Points'),
    unit: 'points',
    cost: 'bonus',
    recharge: () => 'long',
  },
  'innate-sorcery': uses(['sorcerer'], () => 2, 'bonus', 'long'),
  'arcane-recovery': uses(['wizard'], () => 1, 'out-of-fight', 'long'),
  'magical-cunning': uses(['warlock'], byLevel([[2, 1]]), 'out-of-fight', 'long'),
};

/** The class level a resource counts from: the highest of the classes that give it. */
function resourceLevel(sheet: CharacterSheet, rule: ResourceRule) {
  let best: { readonly level: number; readonly cls: SrdClass; readonly count: number } | null =
    null;
  for (const classId of rule.classes) {
    const level = sheet.classes.find((entry) => entry.classId === classId)?.level ?? 0;
    const cls = level > 0 ? srdClass(classId) : undefined;
    const count = cls ? rule.count(level, sheet, cls) : 0;
    if (cls && count > (best?.count ?? 0)) best = { level, cls, count };
  }
  return best;
}

/** The resources the sheet's classes give at their levels, each with what is left. */
export function classResources(sheet: CharacterSheet): ResourceView[] {
  return CLASS_RESOURCES.flatMap((resource) => {
    const rule = RESOURCE_RULES[resource];
    const at = resourceLevel(sheet, rule);
    if (!at) return [];
    const used = sheet.featureUses?.[resource] ?? 0;
    return [
      {
        resource,
        max: at.count,
        left: Math.max(0, at.count - used),
        unit: rule.unit,
        cost: rule.cost,
        recharge: rule.recharge(at.level),
      },
    ];
  });
}

export const resourceOf = (sheet: CharacterSheet, resource: ClassResource): ResourceView | null =>
  classResources(sheet).find((view) => view.resource === resource) ?? null;

/** The sheet with `used` as the resource's expended uses or points (none: the key goes). */
function withUsed(sheet: CharacterSheet, resource: ClassResource, used: number): CharacterSheet {
  const next: FeatureUses = Object.fromEntries([
    ...Object.entries(sheet.featureUses ?? {}).filter(([key]) => key !== resource),
    ...(used > 0 ? [[resource, used] as const] : []),
  ]);
  const changed: CharacterSheet = { ...sheet, featureUses: next };
  if (Object.keys(next).length === 0) delete changed.featureUses;
  return changed;
}

export type SpendRefusal = 'NOT_A_FEATURE' | 'NO_USES_LEFT';

/** One use, or `amount` points, spent. */
export function spendResource(
  sheet: CharacterSheet,
  resource: ClassResource,
  amount = 1,
): CharacterSheet | SpendRefusal {
  const view = resourceOf(sheet, resource);
  if (!view) return 'NOT_A_FEATURE';
  if (view.left < amount) return 'NO_USES_LEFT';
  return withUsed(sheet, resource, view.max - view.left + amount);
}

/** Uses or points regained, no more than were spent (Font of Magic's slot turned into points). */
export function regainResource(
  sheet: CharacterSheet,
  resource: ClassResource,
  amount: number,
): CharacterSheet {
  const used = sheet.featureUses?.[resource] ?? 0;
  return withUsed(sheet, resource, Math.max(0, used - amount));
}

/** A Warlock's Pact Magic slots: their level and how many (none without Warlock levels). */
export function pactSlots(
  sheet: CharacterSheet,
): { readonly level: number; readonly count: number } | null {
  const level = sheet.classes.find((entry) => entry.classId === 'warlock')?.level ?? 0;
  const cls = srdClass('warlock');
  const casting = level > 0 && cls ? classCasting(cls, 'warlock', level) : null;
  const index = casting?.slots.findIndex((count) => count > 0) ?? -1;
  return casting && index >= 0 ? { level: index + 1, count: casting.slots[index] ?? 0 } : null;
}

/** Expended slots of a level regained, up to `count`. */
export function regainSlots(sheet: CharacterSheet, level: number, count: number): CharacterSheet {
  if ((sheet.spellSlots.expended[level - 1] ?? 0) === 0) return sheet;
  const expended = sheet.spellSlots.expended.map((used, index) =>
    index === level - 1 ? Math.max(0, used - count) : used,
  );
  return { ...sheet, spellSlots: { ...sheet.spellSlots, expended } };
}

/**
 * The end of a Short Rest: one use back of the resources that give one, all of those that give
 * all, and a Warlock's Pact Magic slots (those of its level the character expended, up to the
 * pact's count).
 */
export function afterShortRest(sheet: CharacterSheet): CharacterSheet {
  let next = sheet;
  for (const view of classResources(sheet)) {
    const used = view.max - view.left;
    if (used === 0 || view.recharge === 'long') continue;
    next = withUsed(next, view.resource, view.recharge === 'short-one' ? used - 1 : 0);
  }
  const pact = pactSlots(sheet);
  return pact ? regainSlots(next, pact.level, pact.count) : next;
}

/** A Long Rest: every resource back; a Rage over; a Bardic Inspiration die lapsed. */
export function afterLongRest(sheet: CharacterSheet): CharacterSheet {
  const next = { ...sheet };
  delete next.featureUses;
  delete next.raging;
  delete next.inspirationDie;
  return next;
}
