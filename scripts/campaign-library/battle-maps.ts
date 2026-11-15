import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import sharp from 'sharp';

/**
 * Turns the GPT battle maps of the art workspace into each campaign's `assets/battle-maps/`.
 * Every map was drawn on a canvas with the fight's grid in its middle (`ref/<id>.layout.png`);
 * the grid's own rectangle is cut out, so the picture lies on the board square for square
 * (`object-fit: cover` on a ground of the grid's own shape). Usage, from the repository root:
 *
 *   node --conditions=@ltw/source scripts/campaign-library/battle-maps.ts <art workspace>
 *
 * The workspace's `maps.json` lists each map: campaign folder, place key, grid size and canvas.
 */
interface MapJob {
  id: string;
  campaign: string;
  location: string;
  encounter: string;
  w: number;
  h: number;
  canvas: [number, number];
  band: [number, number];
}

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const CAMPAIGNS = new URL('../../campaigns/', import.meta.url);

export async function prepareBattleMaps(workspace: string): Promise<number> {
  const jobs = JSON.parse(await readFile(join(workspace, 'maps.json'), 'utf8')) as MapJob[];
  const byCampaign = new Map<string, Record<string, unknown>[]>();
  for (const job of jobs) {
    const original = new Uint8Array(await readFile(join(workspace, 'out', `${job.id}.png`)));
    const meta = await sharp(original).metadata();
    const { width, height } = meta;
    // The grid's rectangle in the generated picture, at its actual size.
    const scale = Math.min(width / job.w, height / job.h);
    const bw = Math.round(job.w * scale),
      bh = Math.round(job.h * scale);
    const runtime = await sharp(original)
      .extract({
        left: Math.floor((width - bw) / 2),
        top: Math.floor((height - bh) / 2),
        width: bw,
        height: bh,
      })
      .resize({ width: 1536, height: 1536, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 86, effort: 5 })
      .toBuffer();
    if (runtime.byteLength > 1_500_000) throw new Error(`${job.id}: runtime map too large`);
    const dir = new URL(`${job.campaign}/assets/battle-maps/`, CAMPAIGNS);
    await mkdir(dir, { recursive: true });
    const file = `${job.location}.webp`;
    await writeFile(new URL(file, dir), runtime);
    const prompt = await readFile(join(workspace, `prompt-${job.id}.full.txt`), 'utf8');
    const generated = (await stat(join(workspace, 'out', `${job.id}.png`))).mtime
      .toISOString()
      .slice(0, 10);
    const list = byCampaign.get(job.campaign) ?? [];
    list.push({
      location: job.location,
      encounter: job.encounter,
      grid: [job.w, job.h],
      file,
      sha256: sha(runtime),
      originalSha256: sha(original),
      originalFile: `battle-maps-2026-11-14/out/${job.id}.png`,
      generated,
      prompt: prompt.trim(),
      references: [`ref/${job.id}.layout.png`, `${job.location}.png`],
    });
    byCampaign.set(job.campaign, list);
  }
  for (const [campaign, maps] of byCampaign)
    await writeFile(
      new URL(`${campaign}/assets/battle-maps/manifest.json`, CAMPAIGNS),
      `${JSON.stringify(
        {
          about:
            'Top-down battle maps (OpenAI image generation through Codex CLI), each drawn over its fight grid and cut to it; originals in ~/Documents/living-tabletop-world-art/.',
          maps,
        },
        null,
        1,
      )}\n`,
    );
  return jobs.length;
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  const workspace = process.argv[2];
  if (!workspace) throw new Error('usage: battle-maps.ts <art workspace>');
  process.stdout.write(`battle maps: ${String(await prepareBattleMaps(workspace))}\n`);
}
