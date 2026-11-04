import { ImageGenerationError } from '@ltw/ai';
import type { AssetPurpose } from '@ltw/contracts';
import sharp, { type Sharp } from 'sharp';

/**
 * Re-encoding of a provider's image (docs/STAGE_330_DESIGN.md, `openrouter-openai`): whatever the
 * provider sent, what is stored is a WebP of at most 1,536 px on its longer side and at most
 * 1.5 MB, so the 2 MiB content limit always holds, with no metadata carried over. Processing is
 * mechanical and the same as the curated set's (scripts/curated-set): a figure's flat black
 * background becomes transparent, a battle map is cropped to the encounter grid's 4:3.
 */
export const MAX_EDGE_PX = 1_536;
export const MAX_STORED_BYTES = 1_500_000;
/** Quality 82 first; lower only when a picture would not fit. */
const QUALITIES = [82, 72, 62] as const;
/** A decompression bound: no provider image needs more pixels. */
const MAX_INPUT_PIXELS = 40_000_000;
const INPUT_FORMATS: ReadonlySet<string> = new Set(['png', 'jpeg', 'webp']);
/** The curated set's threshold for a figure's black background (scripts/curated-set/cli.ts). */
const BLACK = 30;

const invalid = () =>
  new ImageGenerationError('PROVIDER_ERROR', 'the provider sent no usable image');

/**
 * The signature of PNG, JPEG or WebP, checked before any decoder sees the bytes: libvips would
 * otherwise run the SVG, TIFF, GIF or HEIF loader on provider bytes first and refuse them only
 * afterwards (Gate 07, G07-09).
 */
export function hasAllowedSignature(bytes: Uint8Array): boolean {
  const at = (offset: number, ...expected: number[]) =>
    expected.every((value, index) => bytes[offset + index] === value);
  return (
    at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) ||
    at(0, 0xff, 0xd8, 0xff) ||
    (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50))
  );
}

const open = (bytes: Uint8Array) =>
  sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });

/** The black reachable from the edges becomes transparent; the figure's own darks stay opaque. */
function floodOut(data: Buffer, width: number, height: number): Buffer {
  const background = new Uint8Array(width * height);
  const stack: number[] = [];
  const dark = (p: number) =>
    Math.max(data[p * 4] ?? 0, data[p * 4 + 1] ?? 0, data[p * 4 + 2] ?? 0) <= BLACK;
  const push = (x: number, y: number) => {
    const p = y * width + x;
    if (background[p] === 0 && dark(p)) {
      background[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y);
    push(width - 1, y);
  }
  for (let p = stack.pop(); p !== undefined; p = stack.pop()) {
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }
  const out = Buffer.from(data);
  for (let p = 0; p < width * height; p += 1) {
    if (background[p] === 1) {
      out.fill(0, p * 4, p * 4 + 4);
      continue;
    }
    // A one-pixel soft edge: the share of opaque pixels around it.
    const x = p % width;
    const y = (p - x) / width;
    let opaque = 0;
    let total = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        total += 1;
        if (background[ny * width + nx] === 0) opaque += 1;
      }
    }
    out[p * 4 + 3] = Math.round(((out[p * 4 + 3] ?? 255) * opaque) / total);
  }
  return out;
}

/** A battle map the DM uploads keeps its own shape: its grid is the DM's, not the 4:3 board's. */
export type ReencodePurpose = AssetPurpose | 'uploaded-battle-map';

async function shaped(bytes: Uint8Array, purpose: ReencodePurpose): Promise<Sharp> {
  if (purpose === 'figure') {
    // Scaled down first: the fill runs on the event loop, so it gets at most 1,536² pixels.
    const { data, info } = await open(bytes)
      .resize({ width: MAX_EDGE_PX, height: MAX_EDGE_PX, fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return sharp(floodOut(data, info.width, info.height), {
      raw: { width: info.width, height: info.height, channels: 4 },
    }).trim({ threshold: 1 });
  }
  if (purpose === 'battle-map') {
    const { width, height } = await open(bytes).metadata();
    // The encounter grid is 4:3: the centre at that shape, as the curated battle map.
    const cropWidth = Math.min(width, Math.round((height * 4) / 3));
    const cropHeight = Math.min(height, Math.round((cropWidth * 3) / 4));
    return open(bytes).extract({
      left: Math.floor((width - cropWidth) / 2),
      top: Math.floor((height - cropHeight) / 2),
      width: cropWidth,
      height: cropHeight,
    });
  }
  return open(bytes);
}

/** Validates and re-encodes; anything that is not a PNG, JPEG or WebP image fails. */
export async function reencodeImage(
  bytes: Uint8Array,
  purpose: ReencodePurpose,
  /** The stored limit; smaller only in tests. */
  maxBytes: number = MAX_STORED_BYTES,
): Promise<Uint8Array> {
  if (!hasAllowedSignature(bytes)) throw invalid();
  let pipeline: Sharp;
  try {
    const { format } = await open(bytes).metadata();
    if (!INPUT_FORMATS.has(format)) throw invalid();
    pipeline = (await shaped(bytes, purpose)).resize({
      width: MAX_EDGE_PX,
      height: MAX_EDGE_PX,
      fit: 'inside',
      withoutEnlargement: true,
    });
  } catch {
    throw invalid();
  }
  for (const quality of QUALITIES) {
    let encoded: Buffer;
    try {
      encoded = await pipeline.clone().webp({ quality, alphaQuality: 100 }).toBuffer();
    } catch {
      throw invalid();
    }
    if (encoded.byteLength <= maxBytes) return new Uint8Array(encoded);
  }
  throw new ImageGenerationError('PROVIDER_ERROR', 'the image does not fit the content limit');
}
