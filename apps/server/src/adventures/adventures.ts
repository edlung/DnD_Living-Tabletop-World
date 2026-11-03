import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  preparedEncounterBookSchema,
  questBookSchema,
  type CampaignTemplate,
  type Language,
  type PreparedEncounter,
  type QuestDefinition,
} from '@ltw/contracts';

import { CURATED_SET_DIR, loadCuratedSet, type CuratedSet } from '../images/curated-set.ts';
import { RAVENFORD_SEED_FILES, loadSeed, type SeedFile } from '../world-engine/ravenford-seed.ts';

/**
 * The ready adventures a DM starts a campaign from (docs/adr/0058-campaign-content.md §5): each its
 * fixtures in both languages — seed scripts run through the World Engine, a quest book, prepared
 * encounters and, for one written with them, the DM's library. A campaign reads its adventure's
 * books (`state.campaign.adventure`), Ravenford's when its history named none.
 */
export const ADVENTURES = ['ravenford', 'hollowmere'] as const;
export type Adventure = (typeof ADVENTURES)[number];

const fixtures = (name: string) =>
  fileURLToPath(new URL(`../../../../fixtures/${name}/`, import.meta.url));

/** Each adventure's fixtures by language. */
export const ADVENTURE_DIRECTORIES: Readonly<
  Record<Adventure, Readonly<Record<Language, string>>>
> = {
  ravenford: { en: fixtures('ravenford'), ru: fixtures('ravenford-ru') },
  hollowmere: { en: fixtures('hollowmere'), ru: fixtures('hollowmere-ru') },
};

/** The template a DM picks, as the adventure and the language it copies. */
export const TEMPLATE_SOURCES: Readonly<
  Record<CampaignTemplate, { readonly adventure: Adventure; readonly language: Language }>
> = {
  'ravenford-en': { adventure: 'ravenford', language: 'en' },
  'ravenford-ru': { adventure: 'ravenford', language: 'ru' },
  'hollowmere-en': { adventure: 'hollowmere', language: 'en' },
  'hollowmere-ru': { adventure: 'hollowmere', language: 'ru' },
};

/**
 * Each adventure's seed scripts in order with their command-ID prefixes, part of the history every
 * copy writes: never renamed.
 */
export const ADVENTURE_SEED_FILES: Readonly<Record<Adventure, readonly SeedFile[]>> = {
  ravenford: RAVENFORD_SEED_FILES,
  hollowmere: [
    { file: 'world-seed.json', prefix: 'world' },
    { file: 'foes-seed.json', prefix: 'foes' },
    { file: 'people-seed.json', prefix: 'people' },
    { file: 'items-seed.json', prefix: 'items' },
    { file: 'party-seed.json', prefix: 'party' },
    { file: 'investigation-seed.json', prefix: 'investigation' },
  ],
};

export const loadAdventureSeed = (adventure: Adventure, language: Language) =>
  loadSeed(ADVENTURE_DIRECTORIES[adventure][language], ADVENTURE_SEED_FILES[adventure]);

/** What a campaign of an adventure reads beside its world: quests and prepared encounters. */
export interface AdventureBooks {
  readonly quests: Readonly<Partial<Record<Language, readonly QuestDefinition[]>>>;
  readonly encounters: Readonly<Partial<Record<Language, readonly PreparedEncounter[]>>>;
}

/** Every adventure but Ravenford, whose books the app's dependencies carry as before. */
export async function loadAdventureBooks(): Promise<Readonly<Record<string, AdventureBooks>>> {
  const read = async (adventure: Adventure, language: Language) => {
    const directory = ADVENTURE_DIRECTORIES[adventure][language];
    const json = async (file: string): Promise<unknown> =>
      JSON.parse(await readFile(join(directory, file), 'utf8'));
    return {
      quests: questBookSchema.parse(await json('quests.json')).quests,
      encounters: preparedEncounterBookSchema.parse(await json('encounters.json')).encounters,
    };
  };
  const books: Record<string, AdventureBooks> = {};
  for (const adventure of ADVENTURES) {
    if (adventure === 'ravenford') continue;
    const [en, ru] = [await read(adventure, 'en'), await read(adventure, 'ru')];
    books[adventure] = {
      quests: { en: en.quests, ru: ru.quests },
      encounters: { en: en.encounters, ru: ru.encounters },
    };
  }
  return books;
}

/**
 * Each adventure's curated pictures (docs/adr/0035-images.md §3), GPT-made and committed with their
 * manifests: Ravenford's set, and Hollowmere's beside Ravenford's (its town and North Gate are
 * Ravenford's). A new campaign imports them through real commands as DM-approved assets; a picture
 * of an entity the campaign lacks is skipped.
 */
export const ADVENTURE_PICTURES: Readonly<Record<Adventure, readonly string[]>> = {
  ravenford: [CURATED_SET_DIR],
  hollowmere: [CURATED_SET_DIR, join(ADVENTURE_DIRECTORIES.hollowmere.en, 'assets')],
};

export type AdventurePictures = Readonly<Record<string, readonly CuratedSet[]>>;

export async function loadAdventurePictures(): Promise<AdventurePictures> {
  const sets = new Map<string, CuratedSet>();
  const pictures: Record<string, readonly CuratedSet[]> = {};
  for (const adventure of ADVENTURES) {
    const loaded: CuratedSet[] = [];
    for (const directory of ADVENTURE_PICTURES[adventure]) {
      const set = sets.get(directory) ?? (await loadCuratedSet(directory));
      sets.set(directory, set);
      loaded.push(set);
    }
    pictures[adventure] = loaded;
  }
  return pictures;
}
