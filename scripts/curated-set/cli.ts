import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import sharp from 'sharp';

import { floodOut, load, toSharp } from '../ui-kit/pixels.ts';

/**
 * Usage: node scripts/curated-set/cli.ts <originals-dir> <generation-manifest.json> <out-dir>
 * Turns the GPT originals of the curated Ravenford set (ADR 0035) into WebP files and writes
 * <out-dir>/manifest.json with provenance. Processing is mechanical: resize, crop the battle map
 * to the grid's 4:3, black to alpha for figures.
 */
interface GenerationItem {
  readonly name: string;
  readonly entity: string;
  readonly variant: 'reference' | 'derived';
  readonly label: string | null;
  readonly kind: 'portrait' | 'scene' | 'object' | 'map' | 'figure';
  readonly refs: readonly string[];
  readonly ref: string | null;
  readonly prompt: string;
}

/**
 * Fixture entity IDs of a generation name that differs from them: pictures several entities
 * share, and entities a player meets unidentified, whose fixture IDs are opaque (ADR 0008, Gate 06
 * remediation). Generation names stay descriptive; they never reach a player.
 */
const ENTITY_IDS: Readonly<Record<string, readonly string[]>> = {
  'goblin-raider': ['creature-10fb59d4', 'creature-589f6668', 'creature-6513bec0'],
  'goblin-shaman': ['creature-ae08be99'],
  'abandoned-caravan-site': ['location-f3b82c8b'],
  'broken-wagon-wheel': ['item-f44e7183'],
  'goblin-weapon': ['item-0869f47a'],
  'burned-cargo': ['item-08851105'],
  'strange-symbol': ['feature-19c7c7f7'],
  'wagon-tracks': ['feature-ccec7e50'],
};
const CONCEPTS: Readonly<Record<string, string>> = {
  overview: 'docs/design/stage-320/owner-concepts/01-overview.webp',
  quad: 'docs/design/stage-320/owner-concepts/02-four-screens.webp',
  items: 'docs/design/stage-320/owner-concepts/03-equipment.webp',
  'dm-flow': 'docs/design/stage-320/owner-concepts/04-dm-creates-a-place.webp',
  bridge: 'docs/design/stage-320/owner-concepts/05-combat-bridge.webp',
  combat: 'docs/design/stage-320/owner-concepts/06-combat-states.webp',
  views: 'docs/design/stage-320/owner-concepts/07-player-and-dm-view.webp',
};

const [originals, generationPath, out] = process.argv.slice(2);
if (!originals || !generationPath || !out) {
  console.error('usage: cli.ts <originals-dir> <generation-manifest.json> <out-dir>');
  process.exit(2);
}
const items = JSON.parse(await readFile(generationPath, 'utf8')) as GenerationItem[];
await mkdir(out, { recursive: true });

async function encode(item: GenerationItem, source: string): Promise<Buffer> {
  switch (item.kind) {
    case 'portrait':
    case 'object':
      return sharp(source).resize(1024, 1024, { fit: 'cover' }).webp({ quality: 84 }).toBuffer();
    case 'scene':
      return sharp(source)
        .resize({ width: 1536, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    case 'map': {
      // The encounter grid is 4:3 (16 × 12); crop the centre to that shape.
      const meta = await sharp(source).metadata();
      const height = meta.height;
      const width = Math.min(meta.width, Math.round((height * 4) / 3));
      const left = Math.floor((meta.width - width) / 2);
      return sharp(source)
        .extract({ left, top: 0, width, height })
        .webp({ quality: 84 })
        .toBuffer();
    }
    case 'figure':
      return toSharp(floodOut(await load(source), 30))
        .trim({ threshold: 1 })
        .resize({ height: 1024, withoutEnlargement: true })
        .webp({ quality: 88, alphaQuality: 100 })
        .toBuffer();
  }
}

const purpose = (item: GenerationItem): string =>
  item.kind === 'figure' ? 'figure' : item.kind === 'map' ? 'battle-map' : 'image';

const entries = [];
for (const item of items) {
  const source = join(originals, `${item.name}.png`);
  const original = await readFile(source).catch(() => null);
  if (!original) {
    console.warn(`skip  ${item.name}: no original`);
    continue;
  }
  const data = await encode(item, source);
  if (data.length > 1_500_000)
    throw new Error(`${item.name}: ${String(data.length)} bytes over 1.5 MB`);
  const file = `${item.name}.webp`;
  await writeFile(join(out, file), data);
  entries.push({
    file,
    entityIds: ENTITY_IDS[item.entity] ?? [item.entity],
    variant: item.variant,
    label: item.label,
    purpose: purpose(item),
    derivedFrom: item.ref === null ? null : `${item.ref}.webp`,
    mediaType: 'image/webp',
    sha256: createHash('sha256').update(data).digest('hex'),
    originalSha256: createHash('sha256').update(original).digest('hex'),
    generated: (await stat(source)).mtime.toISOString().slice(0, 10),
    references: item.refs.map((ref) => CONCEPTS[ref] ?? ref),
    prompt: item.prompt,
  });
  console.log(`built ${file} (${String(Math.round(data.length / 1024))} KB)`);
}

await writeFile(
  join(out, 'manifest.json'),
  `${JSON.stringify(
    {
      about:
        'The curated Ravenford set (ADR 0035): every picture made by an OpenAI image model through ' +
        "Codex CLI on the owner's ChatGPT subscription, in the owner's concept style (ADR 0034). " +
        'Processing is mechanical (scripts/curated-set). GPT originals are kept outside the repository.',
      generator: 'codex-cli/imagegen',
      assets: entries,
    },
    null,
    2,
  )}\n`,
);
