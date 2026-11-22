import sharp from 'sharp';
import { clearStudioBackdrop } from './figure-cutout.mjs';

/** A base or plume can cross a sheet's nominal grid line. Keep the connected painted material
 * with its figure, including across that line, without fragments of the neighbour. */
export async function figureSprites(png, cols, rows, count) {
  const {
    data,
    info: { width, height },
  } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  clearStudioBackdrop(data, width, height);
  const labels = new Int32Array(width * height),
    queue = new Int32Array(labels.length);
  const cells = Array.from({ length: count }, () => []);
  const cw = width / cols,
    ch = height / rows;
  // Soft studio light can span two cells. Only solid paint determines the outline.
  const solid = 145;
  let label = 0;
  for (let seed = 0; seed < labels.length; seed++) {
    if (labels[seed] || data[seed * 4 + 3] < solid) continue;
    label++;
    let start = 0,
      end = 1,
      left = width,
      top = height,
      right = 0,
      bottom = 0,
      sx = 0,
      sy = 0;
    queue[0] = seed;
    labels[seed] = label;
    const offer = (index) => {
      if (labels[index] || data[index * 4 + 3] < solid) return;
      labels[index] = label;
      queue[end++] = index;
    };
    while (start < end) {
      const index = queue[start++],
        x = index % width,
        y = (index - x) / width;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      sx += x;
      sy += y;
      if (x > 0) offer(index - 1);
      if (x + 1 < width) offer(index + 1);
      if (y > 0) {
        offer(index - width);
        if (x > 0) offer(index - width - 1);
        if (x + 1 < width) offer(index - width + 1);
      }
      if (y + 1 < height) {
        offer(index + width);
        if (x > 0) offer(index + width - 1);
        if (x + 1 < width) offer(index + width + 1);
      }
    }
    if (end < 12) continue;
    const cell = Math.floor(sy / end / ch) * cols + Math.floor(sx / end / cw);
    cells[cell]?.push({ label, area: end, left, right, top, bottom });
  }
  return cells.map((parts) => {
    parts.sort((a, b) => b.area - a.area);
    const body = parts[0];
    // A non-separated sheet must use the nominal crop; its silhouette is checked by the caller.
    if (
      !body ||
      body.area < cw * ch * 0.025 ||
      body.right - body.left > cw * 1.42 ||
      body.bottom - body.top > ch * 1.42
    )
      return null;
    const selected = parts.filter(
      (p) =>
        p.area >= Math.max(12, body.area * 0.0004) &&
        p.right - p.left <= cw * 1.42 &&
        p.bottom - p.top <= ch * 1.42 &&
        p.left < body.right + cw * 0.12 &&
        p.right > body.left - cw * 0.12 &&
        p.top < body.bottom + ch * 0.1 &&
        p.bottom > body.top - ch * 0.1,
    );
    const keep = new Set(selected.map((p) => p.label));
    const left = Math.min(...selected.map((p) => p.left)),
      top = Math.min(...selected.map((p) => p.top));
    const w = Math.max(...selected.map((p) => p.right)) - left + 1,
      h = Math.max(...selected.map((p) => p.bottom)) - top + 1;
    const pixels = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const index = (top + y) * width + left + x;
        const edge =
          labels[index] === 0 &&
          data[index * 4 + 3] > 16 &&
          [index - 1, index + 1, index - width, index + width].some((n) => keep.has(labels[n]));
        if (keep.has(labels[index]) || edge)
          data.copy(pixels, (y * w + x) * 4, index * 4, index * 4 + 4);
      }
    return {
      image: sharp(pixels, { raw: { width: w, height: h, channels: 4 } }),
      rect: { left, top, width: w, height: h },
    };
  });
}
