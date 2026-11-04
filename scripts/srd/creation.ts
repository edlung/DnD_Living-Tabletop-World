import {
  SKILL_IDS,
  type Ability,
  type ItemEntry,
  type Skill,
  type SrdBackgroundCreation,
  type SrdClassCreation,
  type SrdPick,
  type SrdPickKind,
  type SrdStartingOption,
  type SrdTools,
} from '../../packages/contracts/src/index.ts';
import { slugOf } from './text.ts';

/**
 * What the SRD gives a new character, read from a class's core traits and a background's words
 * (docs/adr/0056-characters-from-the-srd.md §2): the Hit Point Die, saving throws, skills to
 * choose, tools and the starting equipment options. Each piece of equipment named is found in the
 * item catalog by its name; what the words leave to the player ("Musical Instrument of your
 * choice") is a pick among the catalog's entries of that kind. A name not found throws.
 */
export type Catalog = readonly Pick<ItemEntry, 'itemId' | 'name'>[];

const ABILITY_OF: Readonly<Record<string, Ability>> = {
  Strength: 'str',
  Dexterity: 'dex',
  Constitution: 'con',
  Intelligence: 'int',
  Wisdom: 'wis',
  Charisma: 'cha',
};

/** The SRD's Artisan's Tools (Equipment, "Artisan's Tools"). */
const ARTISANS_TOOLS = [
  'alchemists-supplies',
  'brewers-supplies',
  'calligraphers-supplies',
  'carpenters-tools',
  'cartographers-tools',
  'cobblers-tools',
  'cooks-utensils',
  'glassblowers-tools',
  'jewelers-tools',
  'leatherworkers-tools',
  'masons-tools',
  'painters-supplies',
  'potters-tools',
  'smiths-tools',
  'tinkers-tools',
  'weavers-tools',
  'woodcarvers-tools',
].map((id) => `srd-${id}`);

/** Names the words give a catalog entry by another name ("Arcane Focus (orb)"). */
const ALIASES: Readonly<Record<string, string>> = {
  'arcane focus (crystal)': 'srd-crystal-arcane-focus',
  'arcane focus (orb)': 'srd-orb-arcane-focus',
  'arcane focus (quarterstaff)': 'srd-staff-arcane-focus',
  'druidic focus (quarterstaff)': 'srd-wooden-staff-druidic-focus',
  'druidic focus (sprig of mistletoe)': 'srd-sprig-of-mistletoe-druidic-focus',
  "traveler's clothes": 'srd-clothes-travelers',
  // A wizard's spellbook is a book: the SRD's gear names no other.
  spellbook: 'srd-book',
};

const PICKS: readonly (readonly [RegExp, SrdPickKind])[] = [
  [/^Musical Instrument of your choice$/, 'musical-instrument'],
  [/^Holy Symbol$/, 'holy-symbol'],
  [/^Gaming Set \(same as above\)$/, 'gaming-set'],
  [/^Artisan's Tools or Musical Instrument chosen for/, 'artisans-tools-or-musical-instrument'],
];

const plain = (words: string) => words.replace(/[’‘]/g, "'").trim();

function pickOf(catalog: Catalog, kind: SrdPickKind): SrdPick {
  const named = (tail: string) =>
    catalog.filter((entry) => entry.name.en.endsWith(`(${tail})`)).map((entry) => entry.itemId);
  const from =
    kind === 'musical-instrument'
      ? named('Musical Instrument')
      : kind === 'holy-symbol'
        ? named('Holy Symbol')
        : kind === 'gaming-set'
          ? named('Gaming Set')
          : kind === 'artisans-tools'
            ? ARTISANS_TOOLS
            : [...ARTISANS_TOOLS, ...named('Musical Instrument')];
  return { kind, from };
}

/** A catalog entry by the name the words give it, singular or plural ("4 Handaxes"). */
function entryNamed(catalog: Catalog, name: string): string {
  const wanted = plain(name).toLowerCase();
  const alias = ALIASES[wanted] ?? ALIASES[wanted.replace(/\s*\(.*\)$/, '')];
  if (alias) return alias;
  const bare = wanted.replace(/\s*\((?:prayers|history|occult lore|\d+ sheets)\)$/, '');
  for (const candidate of [bare, bare.replace(/es$/, ''), bare.replace(/s$/, '')]) {
    const found = catalog.find((entry) => plain(entry.name.en).toLowerCase() === candidate);
    if (found) return found.itemId;
  }
  throw new Error(`no catalog entry named "${name}"`);
}

/** "Choose A or B: (A) Greataxe, 4 Handaxes, Explorer's Pack, and 15 GP; or (B) 75 GP". */
export function startingOptions(catalog: Catalog, words: string): SrdStartingOption[] {
  const body = plain(words).replace(/^Choose A(?:, B,)? or [BC]: /, '');
  return body.split(/;\s*(?:or\s+)?(?=\([ABC]\) )/).map((part) => {
    const option = /^\(([ABC])\) (.+)$/.exec(part.trim());
    if (!option) throw new Error(`not an equipment option: "${part}"`);
    const result: SrdStartingOption = {
      label: option[1] as SrdStartingOption['label'],
      items: [],
      picks: [],
      gp: 0,
    };
    for (const raw of (option[2] ?? '').split(/,\s*(?:and\s+)?|\s+and\s+(?=\d+ GP$)/)) {
      const piece = raw.replace(/^and\s+/, '').trim();
      const gold = /^(\d+) GP$/.exec(piece);
      const pick = PICKS.find(([pattern]) => pattern.test(piece));
      if (gold) result.gp = Number(gold[1]);
      else if (pick) result.picks.push(pickOf(catalog, pick[1]));
      else {
        const counted = /^(\d+) (.+)$/.exec(piece);
        const sheets = /\((\d+) sheets\)$/.exec(piece);
        const quantity = Number(counted?.[1] ?? sheets?.[1] ?? 1);
        result.items.push({ catalogId: entryNamed(catalog, counted?.[2] ?? piece), quantity });
      }
    }
    return result;
  });
}

const listOf = (words: string) => words.split(/,\s*or\s+|,\s*and\s+|,\s*|\s+or\s+|\s+and\s+/);

function toolsOf(catalog: Catalog, words: string | undefined): SrdTools {
  if (words === undefined) return { fixed: [], pick: null };
  const text = plain(words).replace(/\s*\(see "Equipment"\)$|\s*\(see “Equipment”\)$/, '');
  const choose = /^Choose (\d+|one) (?:type |kind )?of (.+)$|^Choose (\d+) (.+)$/.exec(text);
  if (choose) {
    const count = Number(choose[1] === 'one' ? 1 : (choose[1] ?? choose[3]));
    const what = (choose[2] ?? choose[4] ?? '').replace(/\s*\(see.*\)$/, '');
    const kind: SrdPickKind = /Artisan's Tools or Musical Instrument/.test(what)
      ? 'artisans-tools-or-musical-instrument'
      : /Musical Instrument/.test(what)
        ? 'musical-instrument'
        : /Gaming Set/.test(what)
          ? 'gaming-set'
          : 'artisans-tools';
    return { fixed: [], pick: { ...pickOf(catalog, kind), count } };
  }
  return { fixed: [entryNamed(catalog, text)], pick: null };
}

export function classCreation(
  name: string,
  core: Readonly<Record<string, string>>,
  catalog: Catalog,
): SrdClassCreation {
  const field = (key: string): string => {
    const words = core[key];
    if (words === undefined) throw new Error(`${name}: no ${key}`);
    return plain(words);
  };
  const die = /^D(6|8|10|12) per /.exec(field('Hit Point Die'));
  if (!die) throw new Error(`${name}: Hit Point Die "${field('Hit Point Die')}"`);
  const saves = field('Saving Throw')
    .split(' and ')
    .map((word) => {
      const ability = ABILITY_OF[word];
      if (!ability) throw new Error(`${name}: no ability "${word}"`);
      return ability;
    });
  const skills = field('Skill Proficiencies');
  const any = /^Choose any (\d+) skills/.exec(skills);
  const some = /^Choose (\d+): (.+)$/.exec(skills);
  if (!any && !some) throw new Error(`${name}: skills "${skills}"`);
  const from: Skill[] = any
    ? [...SKILL_IDS]
    : listOf(some?.[2] ?? '').map((word) => {
        const skill = SKILL_IDS.find((one) => one === slugOf(word));
        if (!skill) throw new Error(`${name}: no skill "${word}"`);
        return skill;
      });
  return {
    hitDie: Number(die[1]) as SrdClassCreation['hitDie'],
    savingThrows: saves,
    skills: { choose: Number(any?.[1] ?? some?.[1]), from },
    tools: toolsOf(catalog, core['Tool Proficiencies']),
    equipment: startingOptions(catalog, field('Starting Equipment')),
  };
}

export const backgroundCreation = (
  tool: string,
  equipment: string,
  catalog: Catalog,
): SrdBackgroundCreation => ({
  tools: toolsOf(catalog, tool),
  equipment: startingOptions(catalog, equipment),
});
