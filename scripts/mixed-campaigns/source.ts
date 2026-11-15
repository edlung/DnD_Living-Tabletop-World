import { readFile, readdir } from 'node:fs/promises';

import type { KitBoss, KitFoe } from '../campaign-shared/combat-kit.ts';
import type { Weather } from '../../packages/contracts/src/index.ts';

export const COLLECTION_ROOT = new URL('../../campaigns/mixed-ages-2026/', import.meta.url);
export const SLUGS = [
  'rain-bureau',
  'red-dune-post',
  'museum-midnight',
  'paper-sea',
  'cedar-tournament',
  'root-city',
  'lantern-court',
  'silent-frequency',
  'copper-canyon',
  'dream-orchestra',
] as const;
export type Archetype = 'fighter' | 'rogue' | 'cleric' | 'wizard';
export interface Hero {
  key: string;
  name: string;
  age: number;
  role: string;
  archetype: Archetype;
  look: string;
  hook: string;
  bond: string;
  personalQuestion: string;
  spotlight: string;
}
export interface Npc {
  key: string;
  name: string;
  age: number;
  location: string;
  look: string;
  public: string;
  want: string;
  secret: string;
  knows: string[];
  boundary: string;
  reveal: string;
}
export interface World {
  /** Set once a campaign is rewritten to the distinctness map (campaigns/distinctness). */
  engine?: string;
  slug: string;
  title: string;
  genre: string;
  audience: string;
  minPlayers: number;
  maxPlayers: number;
  defaultPlayers: number;
  sessionCount: number;
  sessionDuration: string;
  pitch: string;
  setting: string;
  tone: string;
  worldName: string;
  startLocation: string;
  opening: string;
  weather?: Weather;
  truth: string[];
  themes: string[];
  boundaries: string[];
  tableGuidance: string[];
  scaling: { players: number; guidance: string }[];
  endings: { title: string; requires: string; outcome: string; cost: string }[];
  locations: {
    key: string;
    name: string;
    type: 'region' | 'settlement' | 'site' | 'building';
    parent: string | null;
    description: string;
  }[];
}
export interface Clue {
  key: string;
  name: string;
  location: string;
  appearance: string;
  statement: string;
  subjects: string[];
  discovery: string;
  fallback: string;
}
export interface Handout {
  key: string;
  title: string;
  unlock: string;
  text: string;
}
export interface Scene {
  title: string;
  minutes: number;
  play: string;
  choices: string[];
  check: string;
  failForward: string;
}
export interface Session {
  number: number;
  key: string;
  title: string;
  location: string;
  participants: string[];
  clues: string[];
  goal: string;
  readAloud: string;
  scenes: Scene[];
  spotlight: string[];
  consequences: { if: string; then: string }[];
  handouts: string[];
  ending: string;
  dmNote: string;
}
export interface Encounter {
  key: string;
  title: string;
  location: string;
  trigger: string;
  objective: string;
  foeName: string;
  foeDescription: string;
  foeCount: number;
  tactics: string;
  peaceful: string;
  scaling: string;
  terrain: string;
  layout?: string;
  mandatory?: boolean;
  foes?: KitFoe[];
  boss?: KitBoss;
}
export interface Source {
  world: World;
  cast: { heroes: Hero[]; npcs: Npc[] };
  clues: Clue[];
  handouts: Handout[];
  sessions: Session[];
  encounters: Encounter[];
}
export async function loadSource(slug: string): Promise<Source> {
  if (!SLUGS.includes(slug as (typeof SLUGS)[number])) throw new Error(`Unknown campaign ${slug}`);
  const json = async <T>(file: string): Promise<T> =>
    JSON.parse(
      await readFile(new URL(`${slug}/source/${file}.json`, COLLECTION_ROOT), 'utf8'),
    ) as T;
  const sessionFiles = (await readdir(new URL(`${slug}/source/`, COLLECTION_ROOT)))
    .flatMap((file) => /^sessions-(\d+)\.json$/.exec(file)?.[1] ?? [])
    .map(Number)
    .sort((a, b) => a - b);
  const [world, cast, clues, handouts, encounters, ...acts] = await Promise.all([
    json<World>('world'),
    json<Source['cast']>('cast'),
    json<Clue[]>('clues'),
    json<Handout[]>('handouts'),
    json<Encounter[]>('encounters'),
    ...sessionFiles.map((n) => json<Session[]>(`sessions-${n}`)),
  ]);
  if (world.slug !== slug) throw new Error(`Source slug does not match directory: ${slug}`);
  return {
    world,
    cast,
    clues,
    handouts,
    encounters: encounters.map(normalizeEncounter),
    sessions: acts.flat().sort((a, b) => a.number - b.number),
  };
}

/** Rewritten encounters name their foes one by one; older readers still see one foe line. */
function normalizeEncounter(e: Encounter): Encounter {
  const first = e.foes?.[0];
  if (!first) return e;
  return {
    ...e,
    foeName: first.name,
    foeDescription: first.description,
    foeCount: (e.foes ?? []).reduce((sum, foe) => sum + foe.count, 0),
    // Authored JSON of a mandatory fight may omit the peaceful path.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    peaceful: e.peaceful ?? '',
  };
}
