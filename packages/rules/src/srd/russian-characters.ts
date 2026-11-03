import type { SrdBackground, SrdClass, SrdClassFeature, SrdFeat, SrdSpecies } from '@ltw/contracts';

import type { InLanguage, ReferenceLanguage } from './reference-ru.ts';
import charactersRu from './ru/characters.json' with { type: 'json' };
import {
  blockStrings,
  englishHash,
  russianBlock,
  type KeptRussian,
  type Strings,
} from './russian.ts';
import { SRD_BACKGROUNDS, SRD_FEATS, SRD_SPECIES } from './origins.ts';
import { SRD_CLASSES } from './classes.ts';

/**
 * The SRD's characters in Russian (docs/adr/0055-rules-reference-and-toolbox.md §5,
 * docs/adr/0056-characters-from-the-srd.md §1): a class in units small enough for one pass — its
 * names and core traits, each feature, each sidebar, each option — and a species, a background or
 * a feat each one unit. A unit's Russian stands while its English is the one it was made from;
 * otherwise that part reads in English.
 */
const text = (value: Strings | undefined): string => (typeof value === 'string' ? value : '');
const list = (value: Strings | undefined): readonly Strings[] =>
  Array.isArray(value) ? (value as readonly Strings[]) : [];
const field = (value: Strings | undefined, key: string): Strings | undefined =>
  value !== undefined && typeof value === 'object' && !Array.isArray(value)
    ? (value as { readonly [key: string]: Strings })[key]
    : undefined;

export interface CharacterUnit {
  readonly key: string;
  readonly english: Strings;
}

const featureStrings = (feature: SrdClassFeature): Strings => [
  feature.name,
  feature.blocks.map(blockStrings),
];
const russianFeature = (feature: SrdClassFeature, ru: Strings | undefined): SrdClassFeature => {
  const [name, blocks] = list(ru);
  return {
    ...feature,
    name: text(name),
    blocks: feature.blocks.map((block, index) => russianBlock(block, list(blocks)[index])),
  };
};

const classHeadStrings = (cls: SrdClass): Strings => ({
  name: cls.name,
  core: Object.entries(cls.core).map(([label, words]) => [label, words]),
  multiclass: cls.multiclass.map(blockStrings),
  levels: cls.levels.map((level) => [...level.features]),
  subclass: [cls.subclass.name, cls.subclass.tagline ?? '', cls.subclass.intro.map(blockStrings)],
  options: cls.options ? [cls.options.title, cls.options.intro.map(blockStrings)] : '',
});

/** A class's units: its head, then each feature, subclass feature, sidebar and option. */
export function classUnits(cls: SrdClass): CharacterUnit[] {
  const id = cls.classId;
  return [
    { key: id, english: classHeadStrings(cls) },
    ...cls.features.map((feature, index) => ({
      key: `${id}/feature/${String(index)}`,
      english: featureStrings(feature),
    })),
    ...cls.subclass.features.map((feature, index) => ({
      key: `${id}/subclass/${String(index)}`,
      english: featureStrings(feature),
    })),
    ...cls.sidebars.map((sidebar, index) => ({
      key: `${id}/sidebar/${String(index)}`,
      english: [sidebar.title, sidebar.blocks.map(blockStrings)],
    })),
    ...(cls.options?.entries ?? []).map((option) => ({
      key: `${id}/option/${option.optionId}`,
      english: [
        option.name,
        option.prerequisite ?? '',
        option.cost ?? '',
        option.blocks.map(blockStrings),
      ],
    })),
  ];
}

export const speciesStrings = (species: SrdSpecies): Strings => ({
  name: species.name,
  size: species.size,
  traits: species.traits.map((trait) => [trait.name, trait.blocks.map(blockStrings)]),
});
export const backgroundStrings = (background: SrdBackground): Strings => ({
  name: background.name,
  feat: background.feat,
  tool: background.tool,
  equipment: background.equipment,
});
export const featStrings = (feat: SrdFeat): Strings => ({
  name: feat.name,
  prerequisite: feat.prerequisite ?? '',
  blocks: feat.blocks.map(blockStrings),
});

/** Every unit of the characters' dataset, for the translation pass. */
export const characterUnits = (): CharacterUnit[] => [
  ...SRD_CLASSES.flatMap(classUnits),
  ...SRD_SPECIES.map((one) => ({ key: `species/${one.speciesId}`, english: speciesStrings(one) })),
  ...SRD_BACKGROUNDS.map((one) => ({
    key: `background/${one.backgroundId}`,
    english: backgroundStrings(one),
  })),
  ...SRD_FEATS.map((one) => ({ key: `feat/${one.featId}`, english: featStrings(one) })),
];

const kept = charactersRu as Readonly<Record<string, KeptRussian | undefined>>;
/** A unit's Russian when it was made from this English; undefined otherwise. */
const russianOf = (key: string, english: Strings): Strings | undefined => {
  const one = kept[key];
  return one !== undefined && one.hash === englishHash(english) ? one.ru : undefined;
};

/** A class in a language: each part in Russian while its Russian is current. */
export function classIn(cls: SrdClass, language: ReferenceLanguage): InLanguage<SrdClass> {
  if (language !== 'ru') return { value: cls, language: 'en' };
  const head = russianOf(cls.classId, classHeadStrings(cls));
  if (head === undefined) return { value: cls, language: 'en' };
  const part = <T>(key: string, value: T, english: Strings, make: (ru: Strings) => T): T => {
    const ru = russianOf(key, english);
    return ru === undefined ? value : make(ru);
  };
  const id = cls.classId;
  const core = list(field(head, 'core'));
  const [subName, tagline, subIntro] = list(field(head, 'subclass'));
  const [optionsTitle, optionsIntro] = list(field(head, 'options'));
  const value: SrdClass = {
    ...cls,
    name: text(field(head, 'name')),
    core: Object.fromEntries(
      Object.keys(cls.core).map((label, index) => [label, text(list(core[index])[1])]),
    ),
    multiclass: cls.multiclass.map((block, index) =>
      russianBlock(block, list(field(head, 'multiclass'))[index]),
    ),
    levels: cls.levels.map((level, index) => ({
      ...level,
      features: list(list(field(head, 'levels'))[index]).map(text),
    })),
    features: cls.features.map((feature, index) =>
      part(`${id}/feature/${String(index)}`, feature, featureStrings(feature), (ru) =>
        russianFeature(feature, ru),
      ),
    ),
    sidebars: cls.sidebars.map((sidebar, index) =>
      part(
        `${id}/sidebar/${String(index)}`,
        sidebar,
        [sidebar.title, sidebar.blocks.map(blockStrings)],
        (ru) => ({
          title: text(list(ru)[0]),
          blocks: sidebar.blocks.map((block, at) => russianBlock(block, list(list(ru)[1])[at])),
        }),
      ),
    ),
    options: cls.options && {
      title: text(optionsTitle),
      intro: cls.options.intro.map((block, index) =>
        russianBlock(block, list(optionsIntro)[index]),
      ),
      entries: cls.options.entries.map((option) =>
        part(
          `${id}/option/${option.optionId}`,
          option,
          [
            option.name,
            option.prerequisite ?? '',
            option.cost ?? '',
            option.blocks.map(blockStrings),
          ],
          (ru) => {
            const [name, prerequisite, cost, blocks] = list(ru);
            return {
              ...option,
              name: text(name),
              prerequisite: option.prerequisite === null ? null : text(prerequisite),
              cost: option.cost === null ? null : text(cost),
              blocks: option.blocks.map((block, at) => russianBlock(block, list(blocks)[at])),
            };
          },
        ),
      ),
    },
    subclass: {
      ...cls.subclass,
      name: text(subName),
      tagline: cls.subclass.tagline === null ? null : text(tagline),
      intro: cls.subclass.intro.map((block, index) => russianBlock(block, list(subIntro)[index])),
      features: cls.subclass.features.map((feature, index) =>
        part(`${id}/subclass/${String(index)}`, feature, featureStrings(feature), (ru) =>
          russianFeature(feature, ru),
        ),
      ),
    },
  };
  return { value, language: 'ru' };
}

export function speciesIn(
  species: SrdSpecies,
  language: ReferenceLanguage,
): InLanguage<SrdSpecies> {
  const ru =
    language === 'ru'
      ? russianOf(`species/${species.speciesId}`, speciesStrings(species))
      : undefined;
  if (ru === undefined) return { value: species, language: 'en' };
  return {
    value: {
      ...species,
      name: text(field(ru, 'name')),
      size: text(field(ru, 'size')),
      traits: species.traits.map((trait, index) => {
        const [name, blocks] = list(list(field(ru, 'traits'))[index]);
        return {
          name: text(name),
          blocks: trait.blocks.map((block, at) => russianBlock(block, list(blocks)[at])),
        };
      }),
    },
    language: 'ru',
  };
}

export function backgroundIn(
  background: SrdBackground,
  language: ReferenceLanguage,
): InLanguage<SrdBackground> {
  const ru =
    language === 'ru'
      ? russianOf(`background/${background.backgroundId}`, backgroundStrings(background))
      : undefined;
  if (ru === undefined) return { value: background, language: 'en' };
  return {
    value: {
      ...background,
      name: text(field(ru, 'name')),
      feat: text(field(ru, 'feat')),
      tool: text(field(ru, 'tool')),
      equipment: text(field(ru, 'equipment')),
    },
    language: 'ru',
  };
}

export function featIn(feat: SrdFeat, language: ReferenceLanguage): InLanguage<SrdFeat> {
  const ru = language === 'ru' ? russianOf(`feat/${feat.featId}`, featStrings(feat)) : undefined;
  if (ru === undefined) return { value: feat, language: 'en' };
  return {
    value: {
      ...feat,
      name: text(field(ru, 'name')),
      prerequisite: feat.prerequisite === null ? null : text(field(ru, 'prerequisite')),
      blocks: feat.blocks.map((block, index) =>
        russianBlock(block, list(field(ru, 'blocks'))[index]),
      ),
    },
    language: 'ru',
  };
}
