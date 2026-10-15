import sharp from 'sharp';

/**
 * Mechanical pixel operations for GPT-made UI-kit originals (ADR 0034): no retouching, only
 * background-to-alpha, glyph slicing, seamless wrapping and resizing.
 */
export interface Rgba {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export async function load(path: string): Promise<Rgba> {
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

export function toSharp(image: Rgba): sharp.Sharp {
  return sharp(Buffer.from(image.data), {
    raw: { width: image.width, height: image.height, channels: 4 },
  });
}

const luminance = (data: Uint8ClampedArray, i: number): number =>
  0.2126 * (data[i] ?? 0) + 0.7152 * (data[i + 1] ?? 0) + 0.0722 * (data[i + 2] ?? 0);

/** Luminous ornament on black: alpha from brightness, colour un-premultiplied. */
export function unscreen(image: Rgba, floor = 12): Rgba {
  const out = new Uint8ClampedArray(image.data.length);
  for (let i = 0; i < image.data.length; i += 4) {
    const r = image.data[i] ?? 0;
    const g = image.data[i + 1] ?? 0;
    const b = image.data[i + 2] ?? 0;
    const peak = Math.max(r, g, b);
    const alpha = peak <= floor ? 0 : Math.min(1, ((peak - floor) / (255 - floor)) * 1.1);
    out[i] = alpha === 0 ? 0 : Math.min(255, r / alpha);
    out[i + 1] = alpha === 0 ? 0 : Math.min(255, g / alpha);
    out[i + 2] = alpha === 0 ? 0 : Math.min(255, b / alpha);
    out[i + 3] = Math.round(alpha * 255);
  }
  return { ...image, data: out };
}

/**
 * Solid object on black: the black reachable from the edges (and from any extra seeds) becomes
 * transparent; the object's own dark parts stay opaque. Edges are softened by one pixel.
 */
export function floodOut(
  image: Rgba,
  threshold = 30,
  seeds: readonly [number, number][] = [],
): Rgba {
  const { width, height, data } = image;
  const background = new Uint8Array(width * height);
  const stack: number[] = [];
  const dark = (p: number): boolean =>
    Math.max(data[p * 4] ?? 0, data[p * 4 + 1] ?? 0, data[p * 4 + 2] ?? 0) <= threshold;
  const push = (x: number, y: number): void => {
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
  for (const [x, y] of seeds) push(Math.round(x * (width - 1)), Math.round(y * (height - 1)));
  while (stack.length > 0) {
    const p = stack.pop() ?? 0;
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }
  const out = new Uint8ClampedArray(data);
  for (let p = 0; p < width * height; p += 1) {
    if (background[p] === 1) {
      out.fill(0, p * 4, p * 4 + 4);
      continue;
    }
    // One-pixel soft edge: average opacity over the 3×3 neighbourhood.
    let opaque = 0;
    let total = 0;
    const x = p % width;
    const y = (p - x) / width;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        total += 1;
        if (background[ny * width + nx] === 0) opaque += 1;
      }
    }
    out[p * 4 + 3] = Math.round((255 * opaque) / total);
  }
  return { ...image, data: out };
}

/** Wraps a texture so it tiles: two separable offset-and-blend passes (no content is drawn). */
export function seamless(image: Rgba): Rgba {
  return wrap(wrap(image, 'x'), 'y');
}

function wrap(image: Rgba, axis: 'x' | 'y'): Rgba {
  const { width, height, data } = image;
  const out = new Uint8ClampedArray(data.length);
  const span = axis === 'x' ? width : height;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const t = axis === 'x' ? x : y;
      // Weight of the original: 1 in the middle, 0 at the edges, where the shifted copy is seamless.
      const keep = 1 - Math.abs((2 * t) / (span - 1) - 1);
      const sx = axis === 'x' ? (x + width / 2) % width : x;
      const sy = axis === 'y' ? (y + height / 2) % height : y;
      const i = (y * width + x) * 4;
      const j = (Math.floor(sy) * width + Math.floor(sx)) * 4;
      for (let c = 0; c < 4; c += 1) {
        out[i + c] = keep * (data[i + c] ?? 0) + (1 - keep) * (data[j + c] ?? 0);
      }
    }
  }
  return { ...image, data: out };
}

interface Band {
  readonly start: number;
  readonly end: number;
}

/** Splits an occupancy profile into `count` content bands separated by empty gaps. */
function bands(occupied: readonly boolean[], count: number, minGap: number): Band[] {
  const runs: Band[] = [];
  let start = -1;
  let gap = 0;
  for (let i = 0; i < occupied.length; i += 1) {
    if (occupied[i]) {
      if (start < 0) start = i;
      gap = 0;
    } else if (start >= 0) {
      gap += 1;
      if (gap >= minGap) {
        runs.push({ start, end: i - gap });
        start = -1;
        gap = 0;
      }
    }
  }
  if (start >= 0) runs.push({ start, end: occupied.length - 1 - gap });
  // Merge the closest neighbours until `count` remain (a glyph with an inner gap).
  while (runs.length > count) {
    let best = 0;
    for (let i = 1; i < runs.length - 1; i += 1) {
      const gapAt = (k: number): number => (runs[k + 1]?.start ?? 0) - (runs[k]?.end ?? 0);
      if (gapAt(i) < gapAt(best)) best = i;
    }
    const a = runs[best];
    const b = runs[best + 1];
    if (!a || !b) break;
    runs.splice(best, 2, { start: a.start, end: b.end });
  }
  if (runs.length !== count) {
    const size = occupied.length / count;
    return Array.from({ length: count }, (_, k) => ({
      start: Math.round(k * size),
      end: Math.round((k + 1) * size) - 1,
    }));
  }
  return runs;
}

export interface GlyphCell {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Finds the 16 glyphs of a 4×4 sheet (white line art on black) row by row. */
export function glyphCells(sheet: Rgba, columns = 4, rows = 4, threshold = 60): GlyphCell[] {
  const { width, height, data } = sheet;
  const lit = (x: number, y: number): boolean => luminance(data, (y * width + x) * 4) > threshold;
  const minGap = Math.round(width / 64);
  const rowBands = bands(
    Array.from({ length: height }, (_, y) => {
      for (let x = 0; x < width; x += 1) if (lit(x, y)) return true;
      return false;
    }),
    rows,
    minGap,
  );
  const cells: GlyphCell[] = [];
  for (const row of rowBands) {
    const columnBands = bands(
      Array.from({ length: width }, (_, x) => {
        for (let y = row.start; y <= row.end; y += 1) if (lit(x, y)) return true;
        return false;
      }),
      columns,
      minGap,
    );
    for (const column of columnBands) {
      let top = row.end;
      let bottom = row.start;
      for (let y = row.start; y <= row.end; y += 1) {
        for (let x = column.start; x <= column.end; x += 1) {
          if (lit(x, y)) {
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
            break;
          }
        }
      }
      cells.push({
        x: column.start,
        y: top,
        width: column.end - column.start + 1,
        height: Math.max(1, bottom - top + 1),
      });
    }
  }
  return cells;
}

/** One glyph as a white alpha mask on a transparent square with an even margin. */
export async function glyphMask(sheet: Rgba, cell: GlyphCell, size: number): Promise<Buffer> {
  const side = Math.ceil(Math.max(cell.width, cell.height) * 1.12);
  const out = new Uint8ClampedArray(side * side * 4);
  const ox = Math.floor((side - cell.width) / 2);
  const oy = Math.floor((side - cell.height) / 2);
  for (let y = 0; y < cell.height; y += 1) {
    for (let x = 0; x < cell.width; x += 1) {
      const l = luminance(sheet.data, ((cell.y + y) * sheet.width + cell.x + x) * 4);
      const alpha = Math.max(0, Math.min(255, ((l - 24) * 255) / (224 - 24)));
      const o = ((oy + y) * side + ox + x) * 4;
      out[o] = 255;
      out[o + 1] = 255;
      out[o + 2] = 255;
      out[o + 3] = alpha;
    }
  }
  return toSharp({ data: out, width: side, height: side })
    .resize(size, size, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toBuffer();
}
