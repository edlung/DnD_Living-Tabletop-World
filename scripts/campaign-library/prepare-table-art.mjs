/** Mechanically cut ImageGen art into maps, location paintings and transparent tabletop pieces.
 * Usage: node scripts/campaign-library/prepare-table-art.mjs <art-workspace>
 * jobs.json identifies the pack, grid, cells, references and prompt; <id>.path locates its PNG.
 * An incomplete batch may be inspected with --partial. Existing, verified outputs are reused.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import sharp from 'sharp';
import { figureSprites } from './figure-sprites.mjs';
import { clearStudioBackdrop } from './figure-cutout.mjs';

const [workspace, mode] = process.argv.slice(2);
if (!workspace) throw new Error('Pass the art workspace containing jobs.json');
const jobs = JSON.parse(await readFile(join(workspace, 'jobs.json'), 'utf8'));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = async (file, fallback) =>
  existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : fallback;
const save = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');
const evidence = new Map();
const maps = new Map();

async function packRecord(pack) {
  if (!evidence.has(pack)) {
    const dir = join(pack, 'assets/table');
    await mkdir(dir, { recursive: true });
    evidence.set(
      pack,
      await json(join(dir, 'manifest.json'), {
        source: 'Built-in ImageGen',
        sheets: [],
        pictures: [],
      }),
    );
  }
  return evidence.get(pack);
}
async function mapList(pack) {
  if (!maps.has(pack))
    maps.set(pack, await json(join(pack, 'assets/battle-maps/manifest.json'), { maps: [] }));
  return maps.get(pack);
}
function replace(entries, next, field) {
  const at = entries.findIndex((e) => e[field] === next[field]);
  if (at < 0) entries.push(next);
  else entries[at] = next;
}
async function crop(job, png, meta, original) {
  const record = await packRecord(job.pack);
  const dir = join(job.pack, 'assets/table');
  const figurine = ['heroes', 'foes', 'npcs'].includes(job.kind);
  const builtin = job.pack === 'fixtures/hollowmere';
  const filename = (t) =>
    builtin ? '../' + t.key + '--figure.webp' : job.kind + '-' + t.key + '.webp';
  const references = job.tiles
    .filter((t) => t.pic)
    .map((t) => relative(process.cwd(), resolve(t.pic)));
  const previous = record.sheets.find((s) => s.id === job.id);
  if (
    previous?.originalSha256 === original &&
    (!figurine || previous.cutoutRevision === 4) &&
    job.tiles.every((t) => existsSync(join(dir, filename(t))))
  ) {
    previous.references = references;
    return;
  }

  const sprites = figurine ? await figureSprites(png, job.cols, job.rows, job.tiles.length) : [];
  for (const [i, t] of job.tiles.entries()) {
    const x = i % job.cols,
      y = Math.floor(i / job.cols);
    const l = Math.round((x * meta.width) / job.cols),
      r = Math.round(((x + 1) * meta.width) / job.cols);
    const top = Math.round((y * meta.height) / job.rows),
      b = Math.round(((y + 1) * meta.height) / job.rows);
    const inset = figurine ? 0 : Math.max(1, Math.floor(Math.min(r - l, b - top) * 0.005));
    let rect = {
      left: l + inset,
      top: top + inset,
      width: r - l - 2 * inset,
      height: b - top - 2 * inset,
    };
    let cut = sharp(png).extract(rect);
    const sprite = sprites[i];
    if (sprite) {
      cut = sprite.image;
      rect = sprite.rect;
    } else if (figurine) {
      // A blank or opaque tile indicates a faulty plate. Never disguise it as a finished piece.
      const { data: raw, info } = await cut
        .clone()
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      clearStudioBackdrop(raw, info.width, info.height);
      let clear = 0,
        ink = 0;
      for (let n = 3; n < raw.length; n += 4) {
        if (raw[n] < 16) clear++;
        if (raw[n] > 200) ink++;
      }
      if (clear < (raw.length / 4) * 0.06 || ink < (raw.length / 4) * 0.025)
        throw new Error(job.id + ': invalid silhouette at ' + t.key);
      cut = sharp(
        await sharp(raw, { raw: { width: info.width, height: info.height, channels: 4 } })
          .png()
          .toBuffer(),
      ).trim({ background: '#00000000', threshold: 6 });
    }
    const file = filename(t);
    const bytes = await cut
      .resize({
        width: figurine ? 300 : 512,
        height: figurine ? 360 : 512,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 86, alphaQuality: 100 })
      .toBuffer();
    if (figurine) {
      const alpha = await sharp(bytes)
        .resize(60, 70, { fit: 'contain', background: '#0000' })
        .extractChannel('alpha')
        .raw()
        .toBuffer();
      if (alpha.filter((opacity) => opacity > 170).length < 360)
        throw Error(job.id + ': figure is too faint at table scale: ' + t.key);
    }
    await writeFile(join(dir, file), bytes);
    replace(
      record.pictures,
      {
        key: t.key,
        title: t.title,
        kind: { heroes: 'hero', foes: 'foe', places: 'place', npcs: 'npc' }[job.kind],
        subjects: t.subjects,
        file,
        sha256: digest(bytes),
        originalSha256: original,
        generated: '2026-11-22',
        sheet: job.id,
        cell: i + 1,
        crop: rect,
      },
      'file',
    );
  }
  replace(
    record.sheets,
    {
      id: job.id,
      ...(figurine ? { cutoutRevision: 4 } : {}),
      originalFile: basename(job.original),
      originalSha256: original,
      columns: job.cols,
      rows: job.rows,
      prompt: job.prompt,
      references,
    },
    'id',
  );
}

async function mapImage(job, png, meta, original) {
  const world = job.kind === 'world';
  const dir = join(job.pack, 'assets', world ? 'world-map' : 'battle-maps');
  await mkdir(dir, { recursive: true });
  const t = job.tiles[0],
    file = world ? 'world-map.webp' : t.key + '.webp';
  const book = world ? await json(join(dir, 'manifest.json'), {}) : await mapList(job.pack);
  const old = world ? book.map : book.maps.find((m) => m.location === t.key);
  if (old?.originalSha256 === original && existsSync(join(dir, file))) return;
  let art = sharp(png);
  if (!world) {
    const s = Math.min(meta.width / t.w, meta.height / t.h);
    const width = Math.round(t.w * s),
      height = Math.round(t.h * s);
    art = art.extract({
      width,
      height,
      left: Math.floor((meta.width - width) / 2),
      top: Math.floor((meta.height - height) / 2),
    });
  }
  const bytes = await art
    .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 83 })
    .toBuffer();
  await writeFile(join(dir, file), bytes);
  const row = {
    file,
    sha256: digest(bytes),
    originalSha256: original,
    originalFile: basename(job.original),
    generated: '2026-11-22',
    prompt: job.prompt,
    references: [],
  };
  if (world)
    await save(join(dir, 'manifest.json'), {
      about: 'Original unlabelled world map. Pin positions in source/world-map.json.',
      map: row,
    });
  else
    replace(
      book.maps,
      { ...row, location: t.key, encounter: t.encounter, grid: [t.w, t.h] },
      'location',
    );
}

const missing = [],
  rejected = [];
for (const job of jobs) {
  const file = join(workspace, job.id + '.path');
  if (!existsSync(file)) {
    missing.push(job.id);
    continue;
  }
  const original = (await readFile(file, 'utf8')).trim(),
    png = await readFile(original);
  const meta = await sharp(png).metadata();
  try {
    const inputs = { ...job, original };
    if (['world', 'ground'].includes(job.kind)) await mapImage(inputs, png, meta, digest(png));
    else await crop(inputs, png, meta, digest(png));
  } catch (e) {
    rejected.push(String(e.message));
  }
}
for (const [pack, record] of evidence) await save(join(pack, 'assets/table/manifest.json'), record);
for (const [pack, book] of maps) await save(join(pack, 'assets/battle-maps/manifest.json'), book);
process.stdout.write(
  JSON.stringify({ jobs: jobs.length, missing: missing.length, rejected }) + '\n',
);
if (rejected.length || (mode !== '--partial' && missing.length)) process.exitCode = 1;
