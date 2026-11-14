import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import sharp from 'sharp';

import prompts from '../../campaigns/lighthouse/assets/prompts.json' with { type: 'json' };
import { cast, items, world } from './data.ts';
import { packRoot } from './render-common.ts';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const reveal: Record<string, number> = {
  cover: 0,
  harbor: 1,
  ship: 2,
  orchard: 3,
  library: 4,
  market: 5,
  forge: 6,
  observatory: 7,
  bells: 8,
  winter: 10,
  lighthouse: 11,
  dawn: 12,
  finn: 0,
  tess: 0,
  asya: 0,
  mika: 0,
  runa: 1,
  spool: 1,
  pom: 3,
  saffra: 4,
  vey: 5,
  ilyr: 6,
  kanto: 8,
  severin: 10,
  seed: 3,
  mirror: 5,
  bridge: 6,
  tuning: 8,
  notebook: 2,
  automaton: 1,
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
    const subjects =
      source.id === 'cover'
        ? ['winds']
        : source.id === 'dawn'
          ? []
          : source.id === 'automaton'
            ? ['dock-keeper-a', 'dock-keeper-b', 'repairer', 'repeat-guardian']
            : source.id === 'observatory'
              ? ['observatory', 'omb']
              : [source.id];
    const title =
      world.locations.find((location) => location.art === source.id)?.name ??
      cast.heroes.find((hero) => hero.key === source.id)?.name ??
      cast.npcs.find((npc) => npc.key === source.id)?.name ??
      items.find((item) => item.key === source.id)?.name ??
      (source.id === 'dawn' ? 'Возвращение домой' : 'Служебный автомат');
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
      editOf: 'editOf' in source ? source.editOf : null,
      prompt:
        'editPrompt' in source
          ? source.editPrompt
          : `${source.prompt}${world.locations.some((location) => location.art === source.id) || source.id === 'dawn' ? `\n${prompts.style}` : ''}`,
    });
  }
  await writeFile(
    new URL('assets/manifest.json', packRoot),
    `${JSON.stringify(
      {
        about:
          'Original artwork for Маяк Между Ветрами. PNG originals; WebP format conversions preserve content and alpha. No project provider was called.',
        generator: 'built-in-imagegen',
        assets,
      },
      null,
      2,
    )}\n`,
  );
  return assets;
}
