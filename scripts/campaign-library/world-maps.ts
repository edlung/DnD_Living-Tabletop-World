import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import sharp from 'sharp';

/**
 * Turns the GPT world maps of an art workspace into each campaign's `assets/world-map/`
 * (`scripts/campaign-shared/world-map.ts`): the picture as runtime WebP and a manifest with how
 * it was made. Originals stay in the workspace, outside the repository. Usage, from the root:
 *
 *   node --conditions=@ltw/source scripts/campaign-library/world-maps.ts <art workspace>
 *
 * The workspace's `maps.json` lists each map: its id (`out/<id>.png`, `prompt-<id>.txt`), the
 * campaign folder under `campaigns/` and the style references it was given.
 */
interface MapJob {
  readonly id: string;
  readonly campaign: string;
  readonly references: readonly string[];
}

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const CAMPAIGNS = new URL('../../campaigns/', import.meta.url);
const FILE = 'world-map.webp';

export async function prepareWorldMaps(workspace: string): Promise<number> {
  const jobs = JSON.parse(await readFile(join(workspace, 'maps.json'), 'utf8')) as MapJob[];
  for (const job of jobs) {
    const png = join(workspace, 'out', `${job.id}.png`);
    const original = new Uint8Array(await readFile(png));
    // The whole picture is the map: pins are fractions of it, so it is never cropped.
    const runtime = await sharp(original)
      .resize({ width: 1536, height: 1536, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 86, effort: 5 })
      .toBuffer();
    if (runtime.byteLength > 1_500_000) throw new Error(`${job.id}: runtime map too large`);
    const dir = new URL(`${job.campaign}/assets/world-map/`, CAMPAIGNS);
    await mkdir(dir, { recursive: true });
    await writeFile(new URL(FILE, dir), runtime);
    const prompt = await readFile(join(workspace, `prompt-${job.id}.txt`), 'utf8');
    const map = {
      file: FILE,
      sha256: sha(runtime),
      originalSha256: sha(original),
      originalFile: `${basename(workspace)}/out/${job.id}.png`,
      generated: (await stat(png)).mtime.toISOString().slice(0, 10),
      prompt: prompt.trim(),
      references: job.references,
    };
    await writeFile(
      new URL('manifest.json', dir),
      `${JSON.stringify(
        {
          about:
            'The world map (OpenAI image generation through Codex CLI): the region from above, without lettering; pins and routes in source/world-map.json. Original in ~/Documents/living-tabletop-world-art/.',
          map,
        },
        null,
        2,
      )}\n`,
    );
  }
  return jobs.length;
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  const workspace = process.argv[2];
  if (!workspace) throw new Error('usage: world-maps.ts <art workspace>');
  process.stdout.write(`world maps: ${String(await prepareWorldMaps(workspace))}\n`);
}
