import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import sharp from 'sharp';

import prompts from '../../campaigns/moon-pearl/assets/prompts.json' with { type: 'json' };
import { cast, items, world } from './data.ts';
import { crabKeys, pointerKeys } from './encounters.ts';
import { packRoot } from './render-common.ts';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const reveal: Record<string, number> = {
  cover: 0,
  museum: 1,
  quay: 2,
  boat: 2,
  market: 3,
  reef: 4,
  theatre: 5,
  glass: 6,
  archive: 7,
  wreck: 8,
  nautilus: 9,
  passage: 10,
  commons: 12,
  home: 12,
  toren: 0,
  leya: 0,
  amalia: 0,
  emil: 0,
  elma: 1,
  nora: 2,
  bubo: 3,
  vella: 4,
  ostin: 5,
  dora: 6,
  ur: 7,
  lucien: 9,
  iris: 11,
  'fold-crab': 6,
  pass: 1,
  lens: 6,
  chime: 5,
  case: 3,
  ribbon: 11,
  pearl: 9,
  'tide-calendar': 2,
  'courier-tag': 8,
  'glass-copy': 9,
  'brass-pointer': 11,
  pinna: 3,
  timokha: 9,
};

/** Format conversion only: preserve the generated originals and alpha, record both hashes. */
export async function prepareAssets() {
  const assets = [];
  await mkdir(new URL('assets/runtime/', packRoot), { recursive: true });
  for (const source of prompts.images) {
    const original = await readFile(new URL(`assets/${source.file}`, packRoot));
    const meta = await sharp(original).metadata();
    if (!meta.width || !meta.height || meta.width < 1000 || meta.height < 1000)
      throw new Error(`Image too small: ${source.id}`);
    const webp = await sharp(original).webp({ quality: 90, effort: 5 }).toBuffer();
    if (webp.byteLength > 1_500_000) throw new Error(`Runtime asset too large: ${source.id}`);
    await writeFile(new URL(`assets/runtime/${source.id}.webp`, packRoot), webp);
    if (source.transparent && !meta.hasAlpha) throw new Error(`Missing alpha: ${source.id}`);
    if (!source.originalFile || !source.generatedAt)
      throw new Error(`Missing provenance: ${source.id}`);
    const subjects =
      source.id === 'cover'
        ? ['sea']
        : source.id === 'home'
          ? []
          : source.id === 'fold-crab'
            ? crabKeys
            : source.id === 'brass-pointer'
              ? pointerKeys
              : [source.id];
    const title =
      world.locations.find((location) => location.art === source.id)?.name ??
      cast.heroes.find((hero) => hero.key === source.id)?.name ??
      cast.npcs.find((npc) => npc.key === source.id)?.name ??
      items.find((item) => item.key === source.id)?.name ??
      (source.id === 'home'
        ? 'Возвращение домой'
        : source.id === 'brass-pointer'
          ? 'Латунная указка'
          : 'Складной бумажный краб');
    assets.push({
      id: source.id,
      title,
      file: source.file,
      runtimeFile: `runtime/${source.id}.webp`,
      sha256: hash(original),
      runtimeSha256: hash(webp),
      bytes: original.length,
      runtimeBytes: webp.length,
      width: meta.width,
      height: meta.height,
      alpha: meta.hasAlpha,
      generated: source.generatedAt,
      source: source.generatedAt === '2026-11-08' ? 'built-in imagegen' : 'codex-cli imagegen',
      originalFile: source.originalFile,
      revealFromEvening: reveal[source.id] ?? 0,
      subjects,
      purpose: 'image',
      prompt: source.prompt,
      references: source.references,
    });
  }
  await writeFile(
    new URL('assets/manifest.json', packRoot),
    `${JSON.stringify(
      {
        about:
          'Original artwork for Тайна Лунной Жемчужины. PNG originals; WebP format conversions preserve content and alpha. No project provider was called.',
        generator: 'built-in-imagegen',
        assets,
      },
      null,
      2,
    )}\n`,
  );
  return assets;
}
