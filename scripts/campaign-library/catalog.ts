import { tableRoutes } from '../campaign-shared/table-routes.ts';
import { withStartingGear } from './starting-gear.ts';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { campaignPackageSchema, type CampaignPackage } from '../../packages/contracts/src/index.ts';
import { campaignCanonicalJson } from '../../apps/server/src/workshop/packages/content.ts';
import {
  artOf,
  tokenSubjects,
  type ArtAsset,
  type ArtSource,
} from '../campaign-shared/campaign-art.ts';
import { artworkCampaignOf } from '../campaign-shared/series.ts';
import {
  WORLD_MAP_KEY,
  withWorldMap,
  worldMapOf,
  type WorldMap,
} from '../campaign-shared/world-map.ts';

import { otherBooks } from './other-books.ts';
import { individualCastReferences, tablePictures } from './table-pictures.ts';

/**
 * The campaign library (work-orders/CAMPAIGN_LIBRARY_RELEASE_2026-11-14.md): the authored campaigns
 * a DM picks in the workshop or the account hub, each with editions and subject-bound pictures.
 */
const originalShelf: readonly LibrarySource[] = [
  { id: 'rain-check', series: 'noir-2026', genre: 'Детективный нуар', audience: '21+' },
  { id: 'last-orbit', series: 'collection-2026', genre: 'Научная фантастика', audience: '16+' },
  { id: 'marrow-crown', series: 'dark-fantasy-2026', genre: 'Тёмное фэнтези', audience: '18+' },
  { id: 'salt-widows', series: 'dark-fantasy-2026', genre: 'Тёмное фэнтези', audience: '18+' },
  {
    id: 'clockwork-carnival',
    series: 'collection-2026',
    genre: 'Комическое фэнтези',
    audience: '12+',
  },
  {
    id: 'sky-archipelago',
    series: 'collection-2026',
    genre: 'Приключенческое фэнтези',
    audience: '14+',
  },
  { id: 'mountain-wedding', series: 'fantasy-2026', genre: 'Мифическое фэнтези', audience: '12+' },
  { id: 'moon-pearl', series: null, genre: 'Семейное морское расследование', audience: '8+' },
  // Reworked by the cloud series of 2026-11-16 (PR #45), art and hero figures 2026-11-17.
  {
    id: 'ember-crown',
    series: 'collection-2026',
    genre: 'Эпическое военное фэнтези',
    audience: '16+',
  },
  { id: 'salt-meridian', series: 'collection-2026', genre: 'Морская авантюра', audience: '16+' },
  { id: 'winter-caravan', series: 'collection-2026', genre: 'Зимнее выживание', audience: '16+' },
  {
    id: 'ash-testament',
    series: 'collection-2026',
    genre: 'Послевоенный вестерн',
    audience: '21+',
  },
  {
    id: 'glass-republic',
    series: 'collection-2026',
    genre: 'Политический шпионский триллер',
    audience: '21+',
  },
  { id: 'hollow-choir', series: 'collection-2026', genre: 'Готический хоррор', audience: '21+' },
  {
    id: 'velvet-ledger',
    series: 'collection-2026',
    genre: 'Оккультно-индустриальный нуар',
    audience: '21+',
  },
];

export const LIBRARY: readonly LibrarySource[] = [...originalShelf, ...otherBooks(originalShelf)];

export interface LibrarySource {
  readonly id: string;
  /** The series folder under `campaigns/`; null for Moon Pearl, which has its own tools. */
  readonly series: string | null;
  readonly genre: string;
  readonly audience: string;
}

export interface LibraryVariant {
  readonly id: string;
  readonly players: number;
  readonly label: string;
  readonly content: CampaignPackage;
  /** SHA-256 of the package's canonical JSON: how an activated campaign is recognised. */
  readonly digest: string;
}

export interface LibraryPicture {
  /** The curated set's file name (a figure reuses its reference's bytes under another name). */
  readonly file: string;
  /** Where the bytes are, relative to the repository root. */
  readonly source: string;
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly originalSha256: string;
  readonly generated: string;
  readonly prompt: string;
  readonly references: readonly string[];
  readonly variant: 'reference' | 'derived';
  readonly label: string | null;
  readonly purpose: 'image' | 'figure' | 'battle-map';
  readonly derivedFrom: string | null;
  /** The package keys it shows, per variant ID. */
  readonly subjects: Readonly<Record<string, readonly string[]>>;
}

export interface LibraryCampaign {
  readonly source: LibrarySource;
  readonly root: URL;
  readonly variants: readonly LibraryVariant[];
  readonly defaultVariant: string;
  readonly pictures: readonly LibraryPicture[];
}

const CAMPAIGNS = new URL('../../campaigns/', import.meta.url);
const REPOSITORY = new URL('../../', import.meta.url);
const relative = (url: URL) => url.href.slice(REPOSITORY.href.length);
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const playersLabel = (n: number) =>
  `${String(n)} ${n === 1 ? 'игрок' : n >= 2 && n <= 4 ? 'игрока' : 'игроков'}`;

const outlineForTable = (root: URL) =>
  tableRoutes(root).map((route) => route.name + '. ' + route.steps.join(' '));

function variantOf(
  id: string,
  label: string,
  content: unknown,
  map: WorldMap | null,
  alternatives: string[],
): LibraryVariant {
  const prepared = campaignPackageSchema.parse(content);
  const authored = withStartingGear({
    ...prepared,
    laterOutline: [...prepared.laterOutline, ...alternatives],
  });
  // The world map joins the package only with its picture (ADR 0057 §10): pins need the map.
  const parsed = map?.picture ? campaignPackageSchema.parse(withWorldMap(authored, map)) : authored;
  return {
    id,
    players: parsed.party.length,
    label,
    content: parsed,
    digest: sha(campaignCanonicalJson(parsed)),
  };
}

/** A battle map: GPT top-down art of a fight's place, cut to the fight's grid. */
interface BattleMapEntry {
  location: string;
  file: string;
  sha256: string;
  originalSha256: string;
  generated: string;
  prompt: string;
  references: string[];
}

function battleMaps(root: URL): BattleMapEntry[] {
  const file = new URL('assets/battle-maps/manifest.json', root);
  if (!existsSync(file)) return [];
  return (JSON.parse(readFileSync(file, 'utf8')) as { maps: BattleMapEntry[] }).maps;
}

/** Each campaign picture as library pictures: the reference, and a figure for a token. */
async function picturesOf(
  root: URL,
  assets: readonly ArtAsset[],
  subjectsFor: (asset: ArtAsset) => Record<string, readonly string[]>,
  variants: readonly LibraryVariant[],
): Promise<LibraryPicture[]> {
  let pictures: LibraryPicture[] = [];
  const known = (variant: LibraryVariant) =>
    new Set(variant.content.entities.map((entity) => entity.key));
  const restrict = (byVariant: Record<string, readonly string[]>) =>
    Object.fromEntries(
      variants.map((v) => {
        const keys = known(v);
        return [v.id, (byVariant[v.id] ?? []).filter((key) => keys.has(key))];
      }),
    );
  const locationFile = new Map<string, string>();
  for (const asset of assets) {
    const at = new URL(`assets/${asset.runtimeFile}`, root);
    const bytes = new Uint8Array(await readFile(at));
    if (sha(bytes) !== asset.runtimeSha256) throw new Error(`${asset.id}: runtime bytes changed`);
    const subjects = restrict(subjectsFor(asset));
    if (Object.values(subjects).every((keys) => keys.length === 0)) continue;
    const base = {
      source: relative(at),
      bytes,
      sha256: asset.runtimeSha256,
      originalSha256: asset.sha256,
      generated: asset.generated,
      prompt: asset.prompt,
      // Older manifests record a reference as an object; the library keeps its file name.
      references: (asset.references as unknown[]).map((r) => {
        if (typeof r === 'string') return r;
        const file = (r as { file?: unknown }).file;
        return typeof file === 'string' ? file : JSON.stringify(r);
      }),
      subjects,
    };
    // A hero's or NPC's painted tabletop figure: its own picture, derived from the portrait.
    if (asset.kind === 'figure') {
      pictures.push({
        ...base,
        file: `${asset.id}.webp`,
        variant: 'derived',
        label: 'figure',
        purpose: 'figure',
        derivedFrom: `${asset.subject ?? ''}.webp`,
      });
      continue;
    }
    pictures.push({
      ...base,
      file: `${asset.id}.webp`,
      variant: 'reference',
      label: null,
      purpose: 'image',
      derivedFrom: null,
    });
    if (asset.kind === 'location') locationFile.set(asset.subjects[0] ?? '', `${asset.id}.webp`);
    // A foe's cut-out (a token; an older manifest's every cut-out) doubles as its tabletop figure
    // on the battlefield, never an item's; one drawn
    // facing left stands as its mirrored file, so every figure faces right (`ArtPrompt.facesLeft`).
    if (asset.kind === 'token') {
      const mirrored = asset.figureFile
        ? await (async () => {
            const at = new URL(`assets/${asset.figureFile ?? ''}`, root);
            const figure = new Uint8Array(await readFile(at));
            if (sha(figure) !== asset.figureSha256)
              throw new Error(`${asset.id}: figure bytes changed`);
            return { source: relative(at), bytes: figure, sha256: sha(figure) };
          })()
        : {};
      pictures.push({
        ...base,
        ...mirrored,
        file: `${asset.id}--figure.webp`,
        variant: 'derived',
        label: 'figure',
        purpose: 'figure',
        derivedFrom: `${asset.id}.webp`,
      });
    }
  }
  const table = await tablePictures(root, variants);
  pictures = individualCastReferences(pictures, table, variants);
  // Some family portraits have a different file name from their subject's package key.
  const references = [...pictures, ...table].filter((p) => p.variant === 'reference');
  for (const piece of table) {
    if (piece.purpose !== 'figure') {
      pictures.push(piece);
      continue;
    }
    const [edition, subjects] =
      Object.entries(piece.subjects).find(([, keys]) => keys.length > 0) ?? [];
    const subject = subjects?.[0];
    if (!edition || !subject) continue;
    const candidates = references.filter((p) => p.subjects[edition]?.includes(subject));
    const parent = candidates.find((p) => p.file === piece.derivedFrom) ?? candidates[0];
    if (!parent) throw new Error('No portrait for figure ' + subject);
    pictures.push({ ...piece, derivedFrom: parent.file });
  }
  const places = new Set(
    variants[0]?.content.entities.filter((e) => e.kind === 'location').map((e) => e.key),
  );
  for (const image of table) {
    if (image.variant !== 'reference') continue;
    for (const group of Object.values(image.subjects)) {
      for (const key of group) if (places.has(key)) locationFile.set(key, image.file);
    }
  }
  for (const map of battleMaps(root)) {
    const reference = locationFile.get(map.location);
    if (!reference) throw new Error(`${map.location}: a battle map needs the place's picture`);
    const at = new URL(`assets/battle-maps/${map.file}`, root);
    const bytes = new Uint8Array(await readFile(at));
    if (sha(bytes) !== map.sha256) throw new Error(`${map.location}: battle map bytes changed`);
    pictures.push({
      file: `${map.location}--map.webp`,
      source: relative(at),
      bytes,
      sha256: map.sha256,
      originalSha256: map.originalSha256,
      generated: map.generated,
      prompt: map.prompt,
      references: map.references,
      variant: 'derived',
      label: 'map',
      purpose: 'battle-map',
      derivedFrom: reference,
      subjects: restrict(Object.fromEntries(variants.map((v) => [v.id, [map.location]]))),
    });
  }
  return pictures;
}

/** The world map's picture, bound to the map place of every variant that has it. */
async function worldMapPicture(
  root: URL,
  map: WorldMap | null,
  variants: readonly LibraryVariant[],
): Promise<LibraryPicture[]> {
  const picture = map?.picture;
  if (!picture) return [];
  const at = new URL(`assets/world-map/${picture.file}`, root);
  const bytes = new Uint8Array(await readFile(at));
  if (sha(bytes) !== picture.sha256) throw new Error(`${root.href}: world map bytes changed`);
  return [
    {
      file: `${WORLD_MAP_KEY}.webp`,
      source: relative(at),
      bytes,
      sha256: picture.sha256,
      originalSha256: picture.originalSha256,
      generated: picture.generated,
      prompt: picture.prompt,
      references: picture.references,
      variant: 'reference',
      label: null,
      purpose: 'image',
      derivedFrom: null,
      subjects: Object.fromEntries(
        variants.map((v) => [
          v.id,
          v.content.entities.some((e) => e.key === WORLD_MAP_KEY) ? [WORLD_MAP_KEY] : [],
        ]),
      ),
    },
  ];
}

/** One library campaign: its packages (built from source now) and its bound pictures. */
export async function libraryCampaign(source: LibrarySource): Promise<LibraryCampaign> {
  if (source.series === null) return familyBook(source);
  const { series, slug } = artworkCampaignOf(`${source.series}/${source.id}`);
  const s = (await series.loadSource(slug)) as ArtSource & {
    world: ArtSource['world'] & { minPlayers: number; maxPlayers: number };
  };
  const root = new URL(`${slug}/`, series.root);
  const map = worldMapOf(root);
  const alternatives = outlineForTable(root);
  const variants: LibraryVariant[] = [];
  for (let size = s.world.minPlayers; size <= s.world.maxPlayers; size++)
    variants.push(
      variantOf(
        `${String(size)}-players`,
        playersLabel(size),
        series.buildPackage(s, size),
        map,
        alternatives,
      ),
    );
  const art = [...artOf(root).values()];
  const pictures = await picturesOf(
    root,
    art,
    (asset) =>
      Object.fromEntries(
        variants.map((v) => [
          v.id,
          asset.kind === 'token' ? tokenSubjects(s, asset.srd ?? '', v.players) : asset.subjects,
        ]),
      ),
    variants,
  );
  return {
    source,
    root,
    variants,
    defaultVariant: `${String(s.world.defaultPlayers)}-players`,
    pictures: [...pictures, ...(await worldMapPicture(root, map, variants))],
  };
}

/** Family books publish an original trio, a quartet and alternative trios. */
async function familyBook(source: LibrarySource): Promise<LibraryCampaign> {
  const root = new URL(source.id + '/', CAMPAIGNS);
  const read = (file: string): unknown =>
    JSON.parse(readFileSync(new URL(`variants/${file}.json`, root), 'utf8'));
  const named = (keys: readonly string[], content: unknown) => {
    const pkg = campaignPackageSchema.parse(content);
    return keys.map((key) => pkg.entities.find((e) => e.key === key)?.name ?? key);
  };
  const full = campaignPackageSchema.parse(read('four-players'));
  const map = worldMapOf(root);
  const alternatives = outlineForTable(root);
  const heroes = full.party;
  const variants = [variantOf('four-players', playersLabel(4), full, map, alternatives)];
  const core = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as unknown;
  variants.push(variantOf('original-party', '3 игрока · основной состав', core, map, alternatives));
  for (const hero of heroes) {
    const file = `without-${hero}`;
    if (!existsSync(new URL(`variants/${file}.json`, root))) continue;
    variants.push(
      variantOf(
        file,
        `3 игрока, без героя «${named([hero], full)[0] ?? hero}»`,
        read(file),
        map,
        alternatives,
      ),
    );
  }
  const manifest = JSON.parse(readFileSync(new URL('assets/manifest.json', root), 'utf8')) as {
    assets: (Omit<ArtAsset, 'references'> & {
      references?: ArtAsset['references'];
      purpose?: string;
    })[];
  };
  const assets = manifest.assets.map((a) => ({
    ...a,
    references: a.references ?? [],
    // Its manifest names no kinds: a place shows a location key, a cut-out is a figure.
    kind:
      a.alpha &&
      a.subjects.some((key) => full.entities.some((e) => e.key === key && e.kind === 'creature'))
        ? ('token' as const)
        : ('location' as const),
  }));
  const locations = new Set(full.entities.filter((e) => e.kind === 'location').map((e) => e.key));
  const pictures = await picturesOf(
    root,
    assets.map((a) =>
      a.kind === 'location' && !locations.has(a.subjects[0] ?? '') ? { ...a, kind: 'portrait' } : a,
    ),
    (asset) => Object.fromEntries(variants.map((v) => [v.id, asset.subjects])),
    variants,
  );
  return {
    source,
    root,
    variants,
    defaultVariant: source.id === 'moon-pearl' ? 'four-players' : 'original-party',
    pictures: [...pictures, ...(await worldMapPicture(root, map, variants))],
  };
}
