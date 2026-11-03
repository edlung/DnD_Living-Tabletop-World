import {
  CLASS_IDS,
  FIGHTING_STYLES,
  type CharacterOptionsResponse,
  type ClassId,
  type NamedItem,
  type OptionEquipment,
  type OptionTools,
  type SrdStartingOption,
  type SrdTools,
  type WeaponId,
} from '@ltw/contracts';
import { SRD_ITEM_CATALOG } from '@ltw/contracts/srd-items';
import { itemEntry } from '@ltw/domain';
import {
  SRD_BACKGROUNDS,
  SRD_FEATS,
  SRD_SPECIES,
  SRD_SPELLS,
  backgroundIn,
  classCasting,
  classIn,
  featIn,
  speciesGains,
  speciesIn,
  speciesOptionWords,
  speciesOptions,
  spellIn,
  srdClass,
  type ReferenceLanguage,
} from '@ltw/rules';

import { entryIn } from '../items/srd-words.ts';

/**
 * What the character builder offers a campaign (docs/adr/0056-characters-from-the-srd.md §2), in
 * its language where the words exist: items and spells by their Russian names once made; classes,
 * species, backgrounds and feats in the SRD's English until their translation pass.
 */
const ORDERS: Partial<
  Record<ClassId, readonly ('protector' | 'thaumaturge' | 'magician' | 'warden')[]>
> = {
  cleric: ['protector', 'thaumaturge'],
  druid: ['magician', 'warden'],
};
const MASTERIES: Partial<Record<ClassId, number>> = {
  barbarian: 2,
  fighter: 3,
  paladin: 2,
  ranger: 2,
  rogue: 2,
};

function optionsIn(language: ReferenceLanguage): Omit<CharacterOptionsResponse, 'startingLevel'> {
  const named = (catalogId: string): NamedItem => {
    const entry = itemEntry(catalogId);
    return { catalogId, name: entry ? entryIn(entry, language).name[language] : catalogId };
  };
  const equipment = (options: readonly SrdStartingOption[]): OptionEquipment[] =>
    options.map((option) => ({
      label: option.label,
      items: option.items.map((item) => ({ ...named(item.catalogId), quantity: item.quantity })),
      picks: option.picks.map((pick) => ({ kind: pick.kind, from: pick.from.map(named) })),
      gp: option.gp,
    }));
  const tools = (own: SrdTools): OptionTools => ({
    fixed: own.fixed.map(named),
    pick: own.pick
      ? { kind: own.pick.kind, count: own.pick.count, from: own.pick.from.map(named) }
      : null,
  });
  const feat = (featId: string) => SRD_FEATS.find((one) => one.featId === featId);
  return {
    language,
    classes: CLASS_IDS.flatMap((classId) => {
      const english = srdClass(classId);
      if (!english) return [];
      const casting = classCasting(english, classId, 1);
      const shown = classIn(english, language);
      const cls = shown.value;
      return [
        {
          classId,
          language: shown.language,
          name: cls.name,
          primaryAbility: cls.core['Primary Ability'] ?? '',
          hitDie: english.creation.hitDie,
          savingThrows: english.creation.savingThrows,
          skills: english.creation.skills,
          tools: tools(english.creation.tools),
          armor: cls.core['Armor Training'] ?? '',
          weapons: cls.core['Weapon Proficiencies'] ?? '',
          equipment: equipment(english.creation.equipment),
          casting: casting
            ? {
                ability: casting.ability,
                cantrips: casting.cantrips,
                prepared: casting.prepared,
                slots: casting.slots.reduce((sum, slots) => sum + slots, 0),
              }
            : null,
          orders: ORDERS[classId] ?? [],
          fightingStyle: classId === 'fighter',
          masteries: MASTERIES[classId] ?? 0,
          invocations:
            classId === 'warlock'
              ? (cls.options?.entries ?? [])
                  .filter((one) => one.prerequisite === null)
                  .map((one) => ({ optionId: one.optionId, name: one.name }))
              : [],
          features: cls.features.filter((one) => one.level === 1).map((one) => one.name),
          allOptions: (cls.options?.entries ?? []).map((one) => ({
            optionId: one.optionId,
            name: one.name,
            prerequisite: one.prerequisite,
          })),
        },
      ];
    }),
    species: SRD_SPECIES.map((species) => {
      const options = speciesOptions(species);
      const shown = speciesIn(species, language);
      const labels = speciesOptionWords(shown.value);
      const gains = (options.length > 0 ? options : [undefined]).map((option) =>
        speciesGains(species, option, undefined, []),
      );
      const first = gains[0];
      return {
        speciesId: species.speciesId,
        language: shown.language,
        name: shown.value.name,
        size: shown.value.size,
        choosesSize: /or Small .*chosen/.test(species.size),
        speedFt: species.speed,
        options: options.map((value, index) => ({ value, label: labels[index] ?? value })),
        skillChoice: first?.skillChoice ?? null,
        originFeat: first?.originFeat ?? false,
        givesSpells: gains.some((one) => one.cantrips.length + one.spells.length > 0),
        traits: shown.value.traits.map((trait) => trait.name),
      };
    }),
    backgrounds: SRD_BACKGROUNDS.map((background) => {
      const shown = backgroundIn(background, language);
      return {
        backgroundId: background.backgroundId,
        language: shown.language,
        name: shown.value.name,
        abilityScores: background.abilityScores,
        feat: shown.value.feat,
        featId: background.featId,
        skills: background.skills,
        tools: tools(background.creation.tools),
        equipment: equipment(background.creation.equipment),
      };
    }),
    originFeats: SRD_FEATS.filter((one) => one.category === 'Origin').map((one) => ({
      featId: one.featId,
      name: featIn(one, language).value.name,
      repeatable: one.repeatable,
    })),
    fightingStyles: FIGHTING_STYLES.map((featId) => ({
      featId,
      name: feat(featId)?.name ?? featId,
    })),
    levelFeats: SRD_FEATS.flatMap((one) =>
      one.category === 'General' || one.category === 'Epic Boon'
        ? [
            {
              featId: one.featId,
              name: featIn(one, language).value.name,
              category: one.category,
              prerequisite: featIn(one, language).value.prerequisite,
            },
          ]
        : [],
    ),
    spells: SRD_SPELLS.map((spell) => ({
      spellId: spell.spellId,
      name: spellIn(spell, language).value.name,
      level: spell.level,
      school: spell.school,
      classes: spell.classes,
    })),
    weapons: [
      ...new Map(
        SRD_ITEM_CATALOG.flatMap((entry) =>
          entry.weapon && entry.magic === undefined
            ? [[entry.weapon, entryIn(entry, language).name[language]] as const]
            : [],
        ),
      ),
    ].map(([weaponId, name]: readonly [WeaponId, string]) => ({ weaponId, name })),
  };
}

const OPTIONS = { en: optionsIn('en'), ru: optionsIn('ru') };
export const characterOptions = (
  language: ReferenceLanguage,
): Omit<CharacterOptionsResponse, 'startingLevel'> => OPTIONS[language];
