import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import sharp from 'sharp';

import { foeRoster, isKit, type KitEncounter } from './combat-kit.ts';

/**
 * Original pictures of a reworked campaign of any series (owner rule: all art from the OpenAI image
 * model, one style per campaign). `assets/prompts.json` lists each picture with its prompt and
 * provenance; `prepareArt` converts the PNG originals to runtime WebP and writes
 * `assets/manifest.json` with hashes, the entities each picture shows and the evening from which a
 * player may see it. Campaigns without `assets/` render exactly as before.
 */
export interface ArtPrompt {
  id: string;
  file: string;
  kind: 'cover' | 'location' | 'portrait' | 'item' | 'token';
  transparent: boolean;
  prompt: string;
  originalFile: string;
  generatedAt: string;
  references: string[];
  /** Token art: the SRD block whose foes this picture shows. */
  srd?: string;
  /** First evening a player may see it, when the picture shows more than the entity's first appearance. */
  reveal?: number;
}
export interface ArtAsset {
  id: string;
  title: string;
  file: string;
  runtimeFile: string;
  sha256: string;
  runtimeSha256: string;
  width: number;
  height: number;
  alpha: boolean;
  generated: string;
  source: string;
  originalFile: string;
  revealFromEvening: number;
  subjects: string[];
  kind: ArtPrompt['kind'];
  srd?: string;
  prompt: string;
  references: string[];
}

/** What the art tools read from a campaign source; collection and fantasy sources both fit. */
export interface ArtSource {
  world: {
    slug: string;
    title: string;
    startLocation: string;
    defaultPlayers: number;
    locations: readonly { key: string; name: string; parent: string | null }[];
  };
  cast: {
    heroes: readonly { key: string; name: string }[];
    npcs: readonly { key: string; name: string }[];
  };
  items: readonly { key: string; name: string; appears: number }[];
  sessions: readonly { number: number; location: string; participants: readonly string[] }[];
  encounters: readonly { key: string; location: string; foes?: unknown }[];
}

const esc = (text: unknown): string =>
  String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** The entities a picture shows and the first evening a player can meet them. */
export function artSubjects(
  s: ArtSource,
  entry: ArtPrompt,
): { subjects: string[]; reveal: number; title: string } {
  const region = s.world.locations.find((l) => l.parent === null);
  if (entry.kind === 'cover')
    return { subjects: region ? [region.key] : [], reveal: 0, title: s.world.title };
  if (entry.kind === 'token') {
    const subjects = tokenSubjects(s, entry.srd ?? '', s.world.defaultPlayers);
    const first = s.encounters.find((e) => subjects.some((key) => key.startsWith(`${e.key}-`)));
    const reveal = s.sessions.find((x) => first && x.location === first.location)?.number ?? 1;
    return { subjects, reveal, title: entry.id };
  }
  const location = s.world.locations.find((l) => l.key === entry.id);
  if (location) {
    const first = s.sessions.find((x) => x.location === location.key)?.number;
    return {
      subjects: [location.key],
      reveal: location.key === s.world.startLocation || location.parent === null ? 0 : (first ?? 1),
      title: location.name,
    };
  }
  const hero = s.cast.heroes.find((h) => h.key === entry.id);
  if (hero) return { subjects: [hero.key], reveal: 0, title: hero.name };
  const npc = s.cast.npcs.find((n) => n.key === entry.id);
  if (npc) {
    const first = s.sessions.find((x) => x.participants.includes(npc.key))?.number;
    return { subjects: [npc.key], reveal: first ?? 1, title: npc.name };
  }
  const item = s.items.find((i) => i.key === entry.id);
  if (item) return { subjects: [item.key], reveal: item.appears, title: item.name };
  throw new Error(`Art ${entry.id} shows nothing in the campaign`);
}

/**
 * Foe keys are numbered per party size, so token pictures are bound by SRD block at the size of
 * the actual campaign, never by keys stored for another size.
 */
export function tokenSubjects(s: ArtSource, srd: string, size: number): string[] {
  return s.encounters.filter(isKit).flatMap((e) =>
    foeRoster(e as KitEncounter, size)
      .filter((f) => f.srd === srd)
      .map((f) => f.key),
  );
}

/** `campaignDir` is the campaign folder URL ending in `/`; pictures live in its `assets/`. */
export async function prepareArt(campaignDir: URL, s: ArtSource): Promise<ArtAsset[]> {
  const dir = new URL('assets/', campaignDir);
  const prompts = JSON.parse(await readFile(new URL('prompts.json', dir), 'utf8')) as {
    images: ArtPrompt[];
  };
  await mkdir(new URL('runtime/', dir), { recursive: true });
  const assets: ArtAsset[] = [];
  for (const entry of prompts.images) {
    const original = await readFile(new URL(entry.file, dir));
    const meta = await sharp(original).metadata();
    if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < 1000)
      throw new Error(`Image too small: ${entry.id}`);
    if (entry.transparent && !meta.hasAlpha) throw new Error(`Missing alpha: ${entry.id}`);
    if (!entry.originalFile || !entry.generatedAt)
      throw new Error(`Missing provenance: ${entry.id}`);
    const webp = await sharp(original).webp({ quality: 88, effort: 5 }).toBuffer();
    if (webp.byteLength > 1_500_000) throw new Error(`Runtime asset too large: ${entry.id}`);
    await writeFile(new URL(`runtime/${entry.id}.webp`, dir), webp);
    const found = artSubjects(s, entry);
    const { reveal: shown, title } = found;
    // One picture per entity: the cover shows the region only when the region has no picture.
    const subjects =
      entry.kind === 'cover' && prompts.images.some((other) => found.subjects.includes(other.id))
        ? []
        : found.subjects;
    const reveal = entry.reveal ?? shown;
    assets.push({
      id: entry.id,
      title,
      file: entry.file,
      runtimeFile: `runtime/${entry.id}.webp`,
      sha256: hash(original),
      runtimeSha256: hash(webp),
      width: meta.width,
      height: meta.height,
      alpha: meta.hasAlpha,
      generated: entry.generatedAt,
      source: 'codex-cli imagegen',
      originalFile: entry.originalFile,
      revealFromEvening: reveal,
      subjects,
      kind: entry.kind,
      ...(entry.srd ? { srd: entry.srd } : {}),
      prompt: entry.prompt,
      references: entry.references,
    });
  }
  await writeFile(
    new URL('manifest.json', dir),
    `${JSON.stringify({ about: `Original artwork for ${s.world.title}. PNG originals from OpenAI image generation through Codex CLI; WebP conversions preserve content and alpha. No project provider was called.`, generator: 'codex-cli-imagegen', assets }, null, 2)}\n`,
  );
  return assets;
}

/** Pictures of a campaign by id; empty when the campaign has none. */
export function artOf(campaignDir: URL): Map<string, ArtAsset> {
  const file = new URL('assets/manifest.json', campaignDir);
  if (!existsSync(file)) return new Map();
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as { assets: ArtAsset[] };
  return new Map(manifest.assets.map((a) => [a.id, a]));
}

export const figure = (
  art: Map<string, ArtAsset>,
  id: string,
  prefix = '',
  className = 'art',
): string => {
  const asset = art.get(id);
  return asset
    ? `<img class="${className}${asset.width < asset.height ? ' portrait' : asset.alpha ? ' token' : ''}" src="${prefix}assets/${esc(asset.runtimeFile)}" alt="${esc(asset.title)}" width="${asset.width}" height="${asset.height}" loading="lazy">`
    : '';
};
