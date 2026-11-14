import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import sharp from 'sharp';

import prompts from '../../campaigns/acorn-express/assets/prompts.json' with { type: 'json' };
import { cast, items, world } from './data.ts';
import { foeKeys } from './encounters.ts';
import { packRoot } from './render-common.ts';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const reveal: Record<string, number> = {
  cover: 0,
  station: 1,
  train: 1,
  bridge: 2,
  raincity: 3,
  honey: 4,
  theatre: 5,
  glass: 6,
  post: 7,
  valley: 8,
  storm: 10,
  garden: 11,
  home: 12,
  boris: 0,
  nika: 0,
  yara: 0,
  oren: 0,
  marfa: 1,
  ri: 1,
  tosh: 2,
  iva: 6,
  velt: 6,
  moroshka: 4,
  kapel: 3,
  sol: 5,
  gardener: 1,
  ticket: 1,
  lantern: 4,
  cloak: 5,
  cup: 6,
  acorn: 7,
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
        ? ['forest']
        : source.id === 'home'
          ? []
          : source.id === 'gardener'
            ? foeKeys
            : source.id === 'valley'
              ? ['valley', 'berest']
              : [source.id];
    const title =
      world.locations.find((location) => location.art === source.id)?.name ??
      cast.heroes.find((hero) => hero.key === source.id)?.name ??
      cast.npcs.find((npc) => npc.key === source.id)?.name ??
      items.find((item) => item.key === source.id)?.name ??
      (source.id === 'home' ? 'Возвращение домой' : 'Служебный садовник');
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
      generated: '2026-11-08',
      source: 'built-in imagegen',
      originalFile: source.originalFile,
      revealFromEvening: reveal[source.id] ?? 0,
      subjects,
      purpose: 'image',
      prompt: source.prompt,
    });
  }
  await writeFile(
    new URL('assets/manifest.json', packRoot),
    `${JSON.stringify(
      {
        about:
          'Original artwork for Экспресс «Тысяча Желудей». PNG originals; WebP format conversions preserve content and alpha. No project provider was called.',
        generator: 'built-in-imagegen',
        assets,
      },
      null,
      2,
    )}\n`,
  );
  return assets;
}
