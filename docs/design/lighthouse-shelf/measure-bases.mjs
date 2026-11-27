import fs from 'node:fs/promises';
import sharp from 'sharp';

const art = new URL('./art/', import.meta.url);
const output = new URL('./data/miniature-bases.generated.css', import.meta.url);
const paintedHeight = 94;
const footY = 89;
const pct = (n) => Number(n.toFixed(3)) + '%';

// Measure the bottom ellipse of the painted plinth. Taking the longest contiguous
// run excludes detached sheet fragments, wands and fabric outside the pedestal.
async function plinth(file) {
  const {
    data,
    info: { width, height },
  } = await sharp(await fs.readFile(new URL(file, art)))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rows = [];
  for (let y = Math.floor(height * 0.88); y < height; y++) {
    let best = { x: 0, width: 0 },
      from = -1;
    for (let x = 0; x <= width; x++) {
      const opaque = x < width && data[(y * width + x) * 4 + 3] >= 135;
      if (opaque && from < 0) from = x;
      if (!opaque && from >= 0) {
        if (x - from > best.width) best = { x: from, width: x - from };
        from = -1;
      }
    }
    if (best.width > width * 0.08) rows.push({ ...best, y });
  }
  const widest = Math.max(...rows.map((r) => r.width));
  const rim = rows.filter((r) => r.width >= widest - 1).at(-1);
  const radiusY = rows.at(-1).y + 1 - rim.y;
  if (radiusY < 3 || radiusY > height * 0.12) throw new Error('Inspect pedestal of ' + file);
  return { width, height, x: rim.x + rim.width / 2, y: rim.y, footprint: widest, radiusY };
}
const blocks = [];
for (const file of (await fs.readdir(art)).filter((f) => /^mini-.*\.webp$/.test(f)).sort()) {
  const b = await plinth(file);
  const scale = paintedHeight / b.height;
  const id = file.slice(5, -5);
  blocks.push(`.sculpt[data-figure='${id}'] {
  --art-width: ${pct(b.width * scale)};
  --art-left: ${pct(50 - b.x * scale)};
  --art-top: ${pct(footY - b.y * scale)};
  --ring-width: ${pct(b.footprint * scale + 6)};
  --ring-height: ${pct(2 * b.radiusY * scale + 3)};
}`);
}
const css =
  '/* Generated from the opaque lower rims by measure-bases.mjs. */\n' + blocks.join('\n') + '\n';
if (process.argv.includes('--check')) {
  if (css !== (await fs.readFile(output, 'utf8')))
    throw new Error('Miniature pedestal measurements are stale.');
} else {
  await fs.writeFile(output, css);
}
process.stdout.write(blocks.length + ' pedestal footprints verified.\n');
