import type { GeneratedImage, ImageBrief, ImageGenerator } from './images.ts';

/**
 * The local placeholder generator (owner decision, ADR 0022 §3): a
 * deterministic SVG pattern from the brief's seed, label, and base, with no
 * external call. It draws no text and reads no name or description, so an
 * image can never tell a player what its entity is called.
 */
export const PLACEHOLDER_MODEL = 'placeholder-svg-1';

const SIZE = 8;

/** 32-bit FNV-1a, salted, as a stream of pseudo-random words. */
function words(text: string, count: number): number[] {
  const out: number[] = [];
  for (let salt = 0; out.length < count; salt += 1) {
    let hash = 0x811c9dc5 ^ salt;
    for (const char of `${String(salt)}:${text}`) {
      hash ^= char.codePointAt(0) ?? 0;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    out.push(hash >>> 0);
  }
  return out;
}

export function placeholderSvg(brief: ImageBrief): string {
  const [hue = 0, accent = 0, ...bits] = words(`${brief.seed}|${brief.basedOn ?? ''}`, 2 + SIZE);
  const base = hue % 360;
  const cells: string[] = [];
  // A left-right mirrored grid, like an identicon.
  for (let row = 0; row < SIZE; row += 1) {
    const rowBits = bits[row] ?? 0;
    for (let col = 0; col < SIZE / 2; col += 1) {
      if (((rowBits >>> col) & 1) === 0) continue;
      const lightness = 35 + ((rowBits >>> (col + 8)) & 3) * 10;
      const fill = `hsl(${String(base)} 55% ${String(lightness)}%)`;
      for (const x of [col, SIZE - 1 - col]) {
        cells.push(
          `<rect x="${String(x * 32)}" y="${String(row * 32)}" width="32" height="32" fill="${fill}"/>`,
        );
      }
    }
  }
  const frameHue = (words(brief.label ?? '', 1)[0] ?? 0) % 360;
  // A derived variant is framed in a hue of its label.
  const frame =
    brief.variant === 'derived'
      ? `<rect x="6" y="6" width="244" height="244" fill="none" stroke="hsl(${String(frameHue)} 70% 50%)" stroke-width="12"/>`
      : '';
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">',
    `<rect width="256" height="256" fill="hsl(${String((base + 180 + (accent % 60)) % 360)} 30% 92%)"/>`,
    ...cells,
    frame,
    '</svg>',
  ].join('');
}

export function createPlaceholderImageGenerator(): ImageGenerator {
  const encoder = new TextEncoder();
  return {
    id: 'local',
    generate: (brief): Promise<GeneratedImage> =>
      Promise.resolve({
        bytes: encoder.encode(placeholderSvg(brief)),
        mediaType: 'image/svg+xml',
        model: PLACEHOLDER_MODEL,
      }),
  };
}
