import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { floodOut, glyphCells, glyphMask, load, seamless, toSharp, unscreen } from './pixels.ts';
import { CHANNEL, CONCEPTS, RECIPES, type Recipe } from './recipes.ts';

/**
 * Usage: node scripts/ui-kit/cli.ts <originals-dir> <prompts.json> <assets-dir> [name ...]
 * Turns GPT originals (<name>.png, kept outside the repository) into the shipped UI kit under
 * <assets-dir>/ui-kit/ and records provenance in <assets-dir>/ui-kit.manifest.json.
 */
interface PromptRecord {
  readonly refs: readonly string[];
  readonly prompt: string;
}

interface ManifestEntry {
  readonly source: string;
  readonly prompt: string;
  readonly references: readonly string[];
  readonly channel: string;
  readonly generated: string;
  readonly originalSha256: string;
  readonly recipe: string;
}

const [originals, promptsPath, assets, ...only] = process.argv.slice(2);
if (!originals || !promptsPath || !assets) {
  console.error('usage: cli.ts <originals-dir> <prompts.json> <assets-dir> [name ...]');
  process.exit(2);
}
const prompts = JSON.parse(await readFile(promptsPath, 'utf8')) as Record<string, PromptRecord>;
const manifestPath = join(assets, 'ui-kit.manifest.json');
const manifest: Record<string, ManifestEntry> = await readFile(manifestPath, 'utf8')
  .then((text) => (JSON.parse(text) as { assets: Record<string, ManifestEntry> }).assets)
  .catch(() => ({}));

const describe = (recipe: Recipe): string => {
  switch (recipe.kind) {
    case 'glyphs':
      return `4x4 sheet sliced by empty gaps; luminance to alpha mask; ${String(recipe.size)} px PNG`;
    case 'unscreen':
      return `black to alpha by brightness, colour un-premultiplied; trimmed; ${String(recipe.width)} px WebP`;
    case 'flood':
      return `edge-connected black to alpha, 1 px soft edge; trimmed; ${String(recipe.width)} px WebP`;
    case 'art':
      return `resized to ${String(recipe.width)} px wide; WebP q${String(recipe.quality)}`;
    case 'tile':
      return `wrapped to tile seamlessly (offset blend); ${String(recipe.width)} px; WebP q${String(recipe.quality)}`;
  }
};

async function write(path: string, data: Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

async function build(name: string, recipe: Recipe): Promise<string[]> {
  const source = join(originals ?? '', `${name}.png`);
  const image = await load(source);
  const root = join(assets ?? '', 'ui-kit');
  switch (recipe.kind) {
    case 'glyphs': {
      const cells = glyphCells(image);
      const files: string[] = [];
      for (const [index, glyph] of recipe.names.entries()) {
        const cell = cells[index];
        if (!cell) throw new Error(`${name}: glyph ${glyph} not found`);
        const file = `glyphs/${glyph}.png`;
        await write(join(root, file), await glyphMask(image, cell, recipe.size));
        files.push(file);
      }
      return files;
    }
    case 'unscreen':
    case 'flood': {
      const cut = recipe.kind === 'unscreen' ? unscreen(image) : floodOut(image, 30, recipe.seeds);
      const data = await toSharp(cut)
        .trim({ threshold: 1 })
        .resize({ width: recipe.width, withoutEnlargement: true })
        .webp({ quality: 88, alphaQuality: 100, effort: 6 })
        .toBuffer();
      await write(join(root, recipe.out), data);
      return [recipe.out];
    }
    case 'art':
    case 'tile': {
      const base = recipe.kind === 'tile' ? toSharp(seamless(image)) : toSharp(image);
      const data = await base
        .resize({ width: recipe.width, withoutEnlargement: true })
        .removeAlpha()
        .webp({ quality: recipe.quality, effort: 6 })
        .toBuffer();
      await write(join(root, recipe.out), data);
      return [recipe.out];
    }
  }
}

const names = Object.keys(RECIPES).filter((name) => only.length === 0 || only.includes(name));
for (const name of names) {
  const recipe = RECIPES[name];
  const source = join(originals, `${name}.png`);
  const original = await readFile(source).catch(() => null);
  if (!recipe || !original) {
    console.warn(`skip  ${name}: no original`);
    continue;
  }
  const record = prompts[name];
  if (!record) throw new Error(`${name}: an original without its prompt`);
  const generated = (await stat(source)).mtime.toISOString().slice(0, 10);
  const files = await build(name, recipe);
  for (const file of files) {
    manifest[file] = {
      source: name,
      prompt: record.prompt,
      references: record.refs.map(
        (ref) => CONCEPTS[ref] ?? `ui-kit:${basename(ref).replace(/\.png$/, '')}`,
      ),
      channel: CHANNEL,
      generated,
      originalSha256: createHash('sha256').update(original).digest('hex'),
      recipe: describe(recipe),
    };
  }
  console.log(`built ${name}: ${files.length} file(s)`);
}

const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
await write(
  manifestPath,
  Buffer.from(
    `${JSON.stringify(
      {
        about:
          'Provenance of every UI-kit picture (ADR 0034): each was made by an OpenAI image model; ' +
          'processing is mechanical (scripts/ui-kit). GPT originals are kept outside the repository.',
        assets: sorted,
      },
      null,
      2,
    )}\n`,
  ),
);
