import {
  DAMAGE_TYPES,
  SKILL_IDS,
  type ChoiceProblem,
  type CreatureSize,
  type DamageType,
  type Skill,
  type SrdBlock,
  type SrdSpecies,
} from '@ltw/contracts';

import { SRD_SPELLS } from '../srd/catalog.ts';

/**
 * What a species gives a new character (SRD 5.2.1, Character Origins; docs/adr/0056-characters-
 * from-the-srd.md §2), read from its traits' words: its size, Speed and Darkvision, the
 * resistances it names, the skills and the Origin feat it lets a player choose, and the option it
 * asks — a Dragonborn's ancestor, an Elf's, a Gnome's or a Tiefling's lineage, a Goliath's giant
 * ancestry — with the cantrips and spells that option gives.
 */
export interface SpeciesGains {
  readonly size: CreatureSize;
  readonly speedFt: number;
  readonly darkvision: number | null;
  readonly resistances: readonly DamageType[];
  /** Dwarven Toughness: a hit point more at every level. */
  readonly hitPointsPerLevel: number;
  readonly cantrips: readonly string[];
  /** Level 1 spells always prepared, cast once without a slot per Long Rest (Forest Gnome). */
  readonly spells: readonly string[];
  readonly skillChoice: { readonly count: number; readonly from: readonly Skill[] } | null;
  readonly originFeat: boolean;
}

const textOf = (blocks: readonly SrdBlock[]): string =>
  blocks
    .map((block) =>
      block.kind === 'table'
        ? block.rows.map((row) => row.join(' ')).join(' ')
        : block.kind === 'names'
          ? block.names.join(' ')
          : `${block.head ? `${block.head}. ` : ''}${block.text}`,
    )
    .join(' ');

const spellNamed = (name: string): string | null =>
  SRD_SPELLS.find((spell) => spell.name.toLowerCase() === name.trim().toLowerCase())?.spellId ??
  null;

/** "You know the Mending and Prestidigitation cantrips", "you know the Fire Bolt cantrip". */
function cantripsIn(words: string): string[] {
  const names = [...words.matchAll(/know the ([A-Z][\w’' ]*?) cantrips?\b/g)].flatMap((match) =>
    (match[1] ?? '').split(' and '),
  );
  return names.map(spellNamed).filter((id): id is string => id !== null);
}

const resistancesIn = (words: string): DamageType[] =>
  [...words.matchAll(/Resistance to (\w+) damage/g)]
    .map((match) => (match[1] ?? '').toLowerCase())
    .filter((type): type is DamageType => (DAMAGE_TYPES as readonly string[]).includes(type));

/** A species' options: the rows of its option table, or its option paragraphs' heads. */
export function speciesOptions(species: SrdSpecies): string[] {
  for (const trait of species.traits) {
    const table = trait.blocks.find((block) => block.kind === 'table');
    if (table?.kind === 'table') return table.rows.map((row) => (row[0] ?? '').toLowerCase());
    const heads = trait.blocks.flatMap((block) =>
      block.kind === 'paragraph' && block.head !== null ? [block.head.toLowerCase()] : [],
    );
    if (heads.length > 1) return heads;
    // A Goliath's ancestries: "Cloud's Jaunt (Cloud Giant). …".
    const giants = trait.blocks.flatMap((block) => {
      const giant = block.kind === 'paragraph' ? /\((\w+) Giant\)\./.exec(block.text) : null;
      return giant ? [(giant[1] ?? '').toLowerCase()] : [];
    });
    if (giants.length > 1) return giants;
  }
  return [];
}

/** The words of the chosen option: its table row or its paragraph. */
function optionWords(species: SrdSpecies, option: string | undefined): string {
  if (option === undefined) return '';
  for (const trait of species.traits)
    for (const block of trait.blocks) {
      if (block.kind === 'table') {
        const row = block.rows.find((cells) => (cells[0] ?? '').toLowerCase() === option);
        if (row) return row.slice(1).join(' ');
      }
      if (block.kind === 'paragraph' && block.head?.toLowerCase() === option) return block.text;
    }
  return '';
}

export function speciesGains(
  species: SrdSpecies,
  option: string | undefined,
  size: 'small' | 'medium' | undefined,
  problems: ChoiceProblem[],
): SpeciesGains {
  const options = speciesOptions(species);
  if (options.length > 0 && (option === undefined || !options.includes(option)))
    problems.push({
      field: 'speciesOption',
      message: 'Choose one of: {options}',
      params: { options: options.join(', ') },
    });
  if (options.length === 0 && option !== undefined)
    problems.push({
      field: 'speciesOption',
      message: '{species} has no option to choose',
      params: { species: species.name },
    });
  const chosen = optionWords(species, options.includes(option ?? '') ? option : undefined);
  const traits = new Map(species.traits.map((trait) => [trait.name, textOf(trait.blocks)]));
  // Only the chosen option's words count where a trait lists every option.
  const own = species.traits
    .filter(
      (trait) => !trait.blocks.some((block) => block.kind === 'table') || options.length === 0,
    )
    .map((trait) => textOf(trait.blocks.filter((block) => block.kind !== 'table')))
    .join(' ');
  const choosesSize = /or Small .*chosen/.test(species.size);
  if (!choosesSize && size !== undefined)
    problems.push({
      field: 'size',
      message: '{species} has its own size',
      params: { species: species.name },
    });
  const darkvision =
    /Darkvision increases to (\d+) feet/.exec(chosen) ??
    /Darkvision with a range of (\d+) feet/.exec(traits.get('Darkvision') ?? '');
  const speed = /Speed increases to (\d+) feet/.exec(chosen);
  const keen = /proficiency in the ([\w ,]+?) skill\./.exec(traits.get('Keen Senses') ?? '');
  const skillful = /proficiency in one skill of your choice/.test(traits.get('Skillful') ?? '');
  const optionSkills = (keen?.[1] ?? '')
    .split(/, or |, /)
    .map((word) => SKILL_IDS.find((skill) => skill === word.trim().toLowerCase()))
    .filter((skill): skill is Skill => skill !== undefined);
  return {
    size: /^Small/.test(species.size) ? 'small' : choosesSize ? (size ?? 'medium') : 'medium',
    speedFt: speed ? Number(speed[1]) : species.speed,
    darkvision: darkvision ? Number(darkvision[1]) : null,
    // A Dragonborn's ancestor names its damage type: the chosen row's words are that type.
    resistances: [
      ...new Set([...resistancesIn(own), ...resistancesIn(chosen), ...typeNamed(chosen)]),
    ],
    hitPointsPerLevel: traits.has('Dwarven Toughness') ? 1 : 0,
    cantrips: [
      ...new Set([...cantripsIn(chosen), ...cantripsIn(traits.get('Otherworldly Presence') ?? '')]),
    ],
    spells: [...chosen.matchAll(/always have the ([A-Z][\w’' ]*?) spell prepared/g)]
      .map((match) => spellNamed(match[1] ?? ''))
      .filter((id): id is string => id !== null),
    skillChoice:
      optionSkills.length > 0
        ? { count: 1, from: optionSkills }
        : skillful
          ? { count: 1, from: [...SKILL_IDS] }
          : null,
    originFeat: traits.has('Versatile'),
  };
}

const typeNamed = (words: string): DamageType[] => {
  const type = words.trim().toLowerCase();
  return (DAMAGE_TYPES as readonly string[]).includes(type) ? [type as DamageType] : [];
};
