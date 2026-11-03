import type { CharacterSheet, CreatureSize, StatBlock } from '@ltw/contracts';

import { SRD_MONSTERS, srdMonsterBlock } from '../srd/catalog.ts';
import { monsterIn } from '../srd/catalogs-ru.ts';
import type { ReferenceLanguage } from '../srd/reference-ru.ts';

/**
 * Wild Shape (SRD 5.2.1, Druid level 2; docs/adr/0056-characters-from-the-srd.md §5): with a
 * Bonus Action a Druid takes the form of an SRD Beast no higher in Challenge Rating than its level
 * allows (the Beast Shapes table), one that flies only from level 8. The form's stat block gives
 * its Armor Class, Strength, Dexterity and Constitution, size, speeds, senses and attacks; the
 * Druid keeps its own Hit Points and gains Temporary Hit Points equal to its Druid level, and casts
 * no spells while it wears the form.
 */
const TIERS = [
  { level: 8, maxRating: 1, fly: true },
  { level: 4, maxRating: 0.5, fly: false },
  { level: 2, maxRating: 0.25, fly: false },
] as const;

export interface WildShapeForm {
  readonly formId: string;
  readonly name: string;
  /** Its Challenge Rating as the SRD writes it ("1/4"). */
  readonly rating: string;
  readonly size: CreatureSize;
  readonly flies: boolean;
}

export const druidLevel = (sheet: CharacterSheet): number =>
  sheet.classes.find((entry) => entry.classId === 'druid')?.level ?? 0;

const ratingValue = (rating: string): number => {
  const [top, bottom] = rating.split('/');
  return bottom === undefined ? Number(top) : Number(top) / Number(bottom);
};

/** The Beast forms a Druid of its level may take, the lowest Challenge Rating first. */
export function wildShapeForms(
  sheet: CharacterSheet,
  language: ReferenceLanguage,
): readonly WildShapeForm[] {
  const tier = TIERS.find((one) => druidLevel(sheet) >= one.level);
  if (!tier) return [];
  return SRD_MONSTERS.flatMap((monster) => {
    if (monster.type !== 'Beast') return [];
    const block = srdMonsterBlock(monster.monsterId)?.statBlock;
    const rating = block?.challenge?.rating;
    if (!block || rating === undefined || ratingValue(rating) > tier.maxRating) return [];
    const flies = block.speeds?.fly !== undefined;
    if (flies && !tier.fly) return [];
    return [
      {
        formId: monster.monsterId,
        name: monsterIn(monster, language).value.name,
        rating,
        size: block.size ?? 'medium',
        flies,
      },
    ];
  }).sort((a, b) => ratingValue(a.rating) - ratingValue(b.rating) || a.name.localeCompare(b.name));
}

/** Whether the Druid may take this form now. */
export const takesForm = (sheet: CharacterSheet, formId: string): boolean =>
  wildShapeForms(sheet, 'en').some((form) => form.formId === formId);

/** The stat block of the form the character wears, if any. */
export function formOf(sheet: CharacterSheet): StatBlock | null {
  const formId = sheet.shape?.formId;
  return formId === undefined ? null : (srdMonsterBlock(formId)?.statBlock ?? null);
}

/** A form's name in the campaign's language. */
export function formName(formId: string, language: ReferenceLanguage): string {
  const monster = SRD_MONSTERS.find((one) => one.monsterId === formId);
  return monster ? monsterIn(monster, language).value.name : formId;
}
