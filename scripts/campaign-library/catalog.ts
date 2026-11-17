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
import { campaignOf } from '../campaign-shared/series.ts';

/**
 * The campaign library (work-orders/CAMPAIGN_LIBRARY_RELEASE_2026-11-14.md): the reworked campaigns
 * a DM picks in the workshop, each with its packages and its pictures bound by package key. Only
 * campaigns rewritten to the owner's standard (GPT art, Sonnet text, critics) belong here.
 */
export const LIBRARY: readonly LibrarySource[] = [
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
];

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

function variantOf(id: string, label: string, content: unknown): LibraryVariant {
  const parsed = campaignPackageSchema.parse(content);
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
  const pictures: LibraryPicture[] = [];
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
    pictures.push({
      ...base,
      file: `${asset.id}.webp`,
      variant: 'reference',
      label: null,
      purpose: 'image',
      derivedFrom: null,
    });
    if (asset.kind === 'location') locationFile.set(asset.subjects[0] ?? '', `${asset.id}.webp`);
    // A cut-out figure doubles as the creature's tabletop figure on the battlefield; one drawn
    // facing left stands as its mirrored file, so every figure faces right (`ArtPrompt.facesLeft`).
    if (asset.kind === 'token' || (asset.alpha && asset.width >= asset.height * 0.5)) {
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

/** One library campaign: its packages (built from source now) and its bound pictures. */
export async function libraryCampaign(source: LibrarySource): Promise<LibraryCampaign> {
  if (source.series === null) return moonPearl(source);
  const { series, slug } = campaignOf(`${source.series}/${source.id}`);
  const s = (await series.loadSource(slug)) as ArtSource & {
    world: ArtSource['world'] & { minPlayers: number; maxPlayers: number };
  };
  const root = new URL(`${slug}/`, series.root);
  const variants: LibraryVariant[] = [];
  for (let size = s.world.minPlayers; size <= s.world.maxPlayers; size++)
    variants.push(
      variantOf(`${String(size)}-players`, playersLabel(size), series.buildPackage(s, size)),
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
    pictures,
  };
}

/** Moon Pearl keeps its own tools: its built variants are four parties of three or four heroes. */
async function moonPearl(source: LibrarySource): Promise<LibraryCampaign> {
  const root = new URL('moon-pearl/', CAMPAIGNS);
  const read = (file: string): unknown =>
    JSON.parse(readFileSync(new URL(`variants/${file}.json`, root), 'utf8'));
  const named = (keys: readonly string[], content: unknown) => {
    const pkg = campaignPackageSchema.parse(content);
    return keys.map((key) => pkg.entities.find((e) => e.key === key)?.name ?? key);
  };
  const full = read('four-players');
  const heroes = campaignPackageSchema.parse(full).party;
  const variants = [variantOf('four-players', playersLabel(4), full)];
  for (const hero of heroes) {
    const file = `without-${hero}`;
    if (!existsSync(new URL(`variants/${file}.json`, root))) continue;
    variants.push(
      variantOf(file, `3 игрока, без героя «${named([hero], full)[0] ?? hero}»`, read(file)),
    );
  }
  const manifest = JSON.parse(readFileSync(new URL('assets/manifest.json', root), 'utf8')) as {
    assets: (ArtAsset & { purpose?: string })[];
  };
  const assets = manifest.assets.map((a) => ({
    ...a,
    // Its manifest names no kinds: a place shows a location key, a cut-out is a figure.
    kind: a.alpha ? ('token' as const) : ('location' as const),
  }));
  const locations = new Set(
    campaignPackageSchema
      .parse(full)
      .entities.filter((e) => e.kind === 'location')
      .map((e) => e.key),
  );
  const pictures = await picturesOf(
    root,
    assets.map((a) =>
      a.kind === 'location' && !locations.has(a.subjects[0] ?? '') ? { ...a, kind: 'portrait' } : a,
    ),
    (asset) => Object.fromEntries(variants.map((v) => [v.id, asset.subjects])),
    variants,
  );
  return { source, root, variants, defaultVariant: 'four-players', pictures };
}
