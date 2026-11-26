import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

import sharp from 'sharp';

/** Mechanical fittings for the live map, from the owner's 1448 × 1086 OpenAI concept.
 * Run with the original fight-foldout.png. The centre of each fitting is empty so real
 * type or the campaign's own die can be placed inside it at any size. */
const source = process.argv[2];
if (!source) throw new Error('Pass the original fight-foldout.png');
const original = await readFile(source);
if (
  createHash('sha256').update(original).digest('hex') !==
  '0be24bb7e508019bf980584affa4c4b28ff296afd9e1769a0c5556322bac481b'
)
  throw new Error('The fold-out requires the approved 1448 × 1086 original');
const output = resolve(import.meta.dirname, '../../apps/web/public/fight-materials');
await mkdir(output, { recursive: true });

type Cut = readonly [number, number, number, number];
const box = ([left, top, width, height]: Cut) => ({ left, top, width, height });
async function fitting(name: string, cut: Cut, outline: string, blank?: Cut) {
  const { width, height } = box(cut);
  const rgb = await sharp(original).extract(box(cut)).removeAlpha().raw().toBuffer();
  if (blank) clearCentre(rgb, width, blank);
  const mask = Buffer.from(
    `<svg width="${String(width)}" height="${String(height)}" xmlns="http://www.w3.org/2000/svg"><path fill="white" d="${outline}"/></svg>`,
  );
  await sharp(rgb, { raw: { width, height, channels: 3 } })
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .webp({ quality: 90, alphaQuality: 94 })
    .toFile(join(output, name + '.webp'));
}

/** Continue the surrounding material into the blank, using its edge colours and fine grain. */
function clearCentre(rgb: Buffer, stride: number, [left, top, width, height]: Cut) {
  const read = (x: number, y: number, c: number) => rgb[(y * stride + x) * 3 + c] ?? 0;
  const at = (x: number, y: number, c: number, value: number) => {
    rgb[(y * stride + x) * 3 + c] = Math.round(Math.max(0, Math.min(255, value)));
  };
  for (let y = top; y < top + height; y++)
    for (let x = left; x < left + width; x++) {
      const dx = x - left + 1,
        dy = y - top + 1;
      const weights = [1 / dx, 1 / (width + 1 - dx), 1 / dy, 1 / (height + 1 - dy)];
      const total = weights.reduce((a, b) => a + b, 0);
      for (let c = 0; c < 3; c++) {
        const edges = [
          read(left - 1, y, c),
          read(left + width, y, c),
          read(x, top - 1, c),
          read(x, top + height, c),
        ];
        const mean = edges.reduce((sum, value, i) => sum + value * (weights[i] ?? 0), 0) / total;
        const sx = left - 4 - (x % 6),
          sy = top + ((y * 3 + x) % height);
        const grain = read(sx, sy, c) - read(sx, sy + 1, c);
        at(x, y, c, mean + 0.3 * grain);
      }
    }
}

await fitting(
  'blossoms',
  [15, 13, 308, 217],
  'M6 4 Q40 0 90 3 L160 2 244 5 272 3 301 10 306 23 292 33 277 39 258 53 231 58 225 76 207 74 199 83 193 107 178 103 171 125 156 128 153 100 144 118 135 139 123 125 119 113 111 133 100 147 96 128 88 135 82 151 72 144 66 135 62 151 58 165 50 153 43 170 36 177 29 202 18 214 16 167 8 147 3 100 Z',
);
await fitting(
  'sprig',
  [1322, 13, 108, 182],
  'M0 4 L51 2 84 1 104 9 107 49 104 104 106 153 95 180 91 151 79 143 78 126 61 130 52 119 40 119 34 116 19 125 23 112 9 111 18 102 0 98 8 87 17 76 29 72 39 65 48 66 52 55 58 50 47 34 24 28 17 19 1 13 Z',
);
await fitting(
  'cartouche',
  [1098, 44, 231, 75],
  'M4 15 Q15 13 20 4 L211 3 Q213 13 225 14 L225 58 Q214 60 210 70 L19 71 Q17 61 5 59 Z',
  [40, 15, 151, 43],
);
await fitting(
  'felt-tray',
  [1164, 794, 239, 215],
  'M5 27 L28 5 207 4 233 27 234 185 210 210 29 207 4 186 Z',
  [65, 41, 113, 130],
);
