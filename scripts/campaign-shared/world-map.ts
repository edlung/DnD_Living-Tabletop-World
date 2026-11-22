import { existsSync, readFileSync } from 'node:fs';

import type {
  CampaignMap,
  CampaignPackage,
  CampaignRoute,
} from '../../packages/contracts/src/index.ts';

/**
 * A library campaign's world map (docs/adr/0057-encounters-maps-loot.md §10, ADR 0058 notes of
 * 2026-11-17). Its region keeps its painted landscape; the map is a place of its own inside the
 * region (`world-map`), whose picture is a GPT map of the region seen from above, without
 * lettering. The places stand pinned where that picture shows them and the routes between them
 * carry their miles, terrain and road, from the campaign's texts.
 *
 * - `source/world-map.json`: the map place's name and description, its pins and routes (authored).
 * - `assets/world-map/manifest.json` and `world-map.webp`: the picture and how it was made
 *   (`scripts/campaign-library/world-maps.ts`; originals outside the repository).
 */
export const WORLD_MAP_KEY = 'world-map';

export interface WorldMapSource {
  /** A plan of rooms, streets or transit stops with no measured overland distances. */
  readonly scale?: 'schematic';
  /** The region the map shows: the map place stands inside it. */
  readonly region: string;
  /** The map place's name as the DM's places and the map's title show it ("Карта: …"). */
  readonly name: string;
  readonly description: string;
  readonly pins: CampaignMap['pins'];
  readonly routes: readonly CampaignRoute[];
}

export interface WorldMapPicture {
  readonly file: string;
  readonly sha256: string;
  readonly originalSha256: string;
  readonly originalFile: string;
  readonly generated: string;
  readonly prompt: string;
  readonly references: readonly string[];
}

export interface WorldMap {
  readonly source: WorldMapSource;
  /** Null until the picture is made; a map without its picture is not put into a package. */
  readonly picture: WorldMapPicture | null;
}

/** The campaign's world map, or null when it has none. */
export function worldMapOf(root: URL): WorldMap | null {
  const source = new URL('source/world-map.json', root);
  if (!existsSync(source)) return null;
  const manifest = new URL('assets/world-map/manifest.json', root);
  return {
    source: JSON.parse(readFileSync(source, 'utf8')) as WorldMapSource,
    picture: existsSync(manifest)
      ? (JSON.parse(readFileSync(manifest, 'utf8')) as { map: WorldMapPicture }).map
      : null,
  };
}

/**
 * The package with its world map: the map place inside the region, a public line that the party
 * has the map (so each of them sees it, with the places they know pinned), the pins and the
 * routes. Pins and routes name only places this package has.
 */
export function withWorldMap(content: CampaignPackage, map: WorldMap): CampaignPackage {
  const { source } = map;
  const places = new Set(
    content.entities.filter((entity) => entity.kind === 'location').map((entity) => entity.key),
  );
  if (!places.has(source.region)) throw new Error(`world map: no region ${source.region}`);
  if (places.has(WORLD_MAP_KEY)) throw new Error(`world map: ${WORLD_MAP_KEY} is taken`);
  return {
    ...content,
    entities: [
      ...content.entities,
      {
        key: WORLD_MAP_KEY,
        kind: 'location',
        name: source.name,
        description: source.description,
        status: 'active',
        existsSince: null,
        location: { type: 'region', parent: source.region },
      },
    ],
    knowledge: [
      ...content.knowledge,
      {
        key: 'public-world-map',
        scope: { kind: 'PUBLIC' },
        knowledgeType: 'FACT',
        statement: source.description,
        subjects: [WORLD_MAP_KEY],
        knownSince: null,
        relations: [],
      },
    ],
    maps: [
      {
        region: WORLD_MAP_KEY,
        pins: source.pins.filter((pin) => places.has(pin.place)),
      },
    ],
    routes: source.routes.filter((route) => places.has(route.from) && places.has(route.to)),
  };
}
