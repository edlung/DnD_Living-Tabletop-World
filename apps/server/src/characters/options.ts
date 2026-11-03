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
  classCasting,
  speciesGains,
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

function optionsIn(language: ReferenceLanguage): CharacterOptionsResponse {
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
      const cls = srdClass(classId);
      if (!cls) return [];
      const casting = classCasting(cls, classId, 1);
      return [
        {
          classId,
          name: cls.name,
          primaryAbility: cls.core['Primary Ability'] ?? '',
          hitDie: cls.creation.hitDie,
          savingThrows: cls.creation.savingThrows,
          skills: cls.creation.skills,
          tools: tools(cls.creation.tools),
          armor: cls.core['Armor Training'] ?? '',
          weapons: cls.core['Weapon Proficiencies'] ?? '',
          equipment: equipment(cls.creation.equipment),
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
        },
      ];
    }),
    species: SRD_SPECIES.map((species) => {
      const options = speciesOptions(species);
      const gains = (options.length > 0 ? options : [undefined]).map((option) =>
        speciesGains(species, option, undefined, []),
      );
      const first = gains[0];
      return {
        speciesId: species.speciesId,
        name: species.name,
        size: species.size,
        choosesSize: /or Small .*chosen/.test(species.size),
        speedFt: species.speed,
        options,
        skillChoice: first?.skillChoice ?? null,
        originFeat: first?.originFeat ?? false,
        givesSpells: gains.some((one) => one.cantrips.length + one.spells.length > 0),
        traits: species.traits.map((trait) => trait.name),
      };
    }),
    backgrounds: SRD_BACKGROUNDS.map((background) => ({
      backgroundId: background.backgroundId,
      name: background.name,
      abilityScores: background.abilityScores,
      feat: background.feat,
      featId: background.featId,
      skills: background.skills,
      tools: tools(background.creation.tools),
      equipment: equipment(background.creation.equipment),
    })),
    originFeats: SRD_FEATS.filter((one) => one.category === 'Origin').map((one) => ({
      featId: one.featId,
      name: one.name,
      repeatable: one.repeatable,
    })),
    fightingStyles: FIGHTING_STYLES.map((featId) => ({
      featId,
      name: feat(featId)?.name ?? featId,
    })),
    spells: SRD_SPELLS.filter((spell) => spell.level <= 1).map((spell) => ({
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
export const characterOptions = (language: ReferenceLanguage): CharacterOptionsResponse =>
  OPTIONS[language];
