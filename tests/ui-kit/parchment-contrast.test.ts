import { readFileSync } from 'node:fs';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

/*
 * Text on the Chronicle's pages reads at 4.5:1 or better everywhere on the parchment
 * (docs/STAGE_320_DESIGN.md §7; review of Stage 320 parts B and C, where the darkest parchment
 * between text lines left the muted ink near 4:1). Measured on the GPT pictures themselves:
 * the book spread under the pages' text areas (as chronicle.css places them) and the single
 * parchment page of a narrow screen, after the veil that lifts any darker parchment to
 * --page-floor ("lighten", per channel) — every pixel, not an average.
 */
const styles = new URL('../../apps/web/src/styles/', import.meta.url).pathname;
const textures = new URL('../../apps/web/src/assets/ui-kit/textures/', import.meta.url).pathname;
const tokens = readFileSync(`${styles}tokens.css`, 'utf8');
const chronicle = readFileSync(`${styles}chronicle.css`, 'utf8');

/** Every ink the pages set text in. */
const INKS = [
  'page-ink',
  'page-ink-muted',
  'rubric',
  'k-fact-ink',
  'k-evidence-ink',
  'k-testimony-ink',
  'k-rumor-ink',
  'k-inference-ink',
  'k-hypothesis-ink',
  'k-contradiction-ink',
  'k-unknown-ink',
  'k-secret-ink',
] as const;

type Rgb = readonly [number, number, number];

function token(name: string): Rgb | null {
  const hex = new RegExp(`--${name}:\\s*#([0-9a-f]{6});`).exec(tokens)?.[1];
  if (!hex) return null;
  const value = Number.parseInt(hex, 16);
  return [value >> 16, (value >> 8) & 255, value & 255];
}

const linear = (channel: number) => {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: Rgb) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

interface Area {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** The pages' text areas on the spread, as fractions of it (`.book-page`, `--left`, `--right`). */
function textAreas(): readonly Area[] {
  const page = /\.book-page \{[^}]*?\btop: ([\d.]+)%;[^}]*?\bbottom: ([\d.]+)%;/s.exec(chronicle);
  const side = (name: string) =>
    new RegExp(`\\.book-page--${name} \\{\\s*left: ([\\d.]+)%;\\s*right: ([\\d.]+)%;`).exec(
      chronicle,
    );
  const left = side('left');
  const right = side('right');
  if (!page || !left || !right) throw new Error('chronicle.css no longer places the pages');
  return [left, right].map((match) => ({
    left: Number(match[1]) / 100,
    right: 1 - Number(match[2]) / 100,
    top: Number(page[1]) / 100,
    bottom: 1 - Number(page[2]) / 100,
  }));
}

/** The spread's veils and the single page's background lift the parchment to the floor. */
const spreadVeiled =
  /\.book-veil \{[^}]*background: var\(--page-floor\);[^}]*mix-blend-mode: lighten;/s.test(
    chronicle,
  );
const pageVeiled =
  /background:\s*linear-gradient\(var\(--page-floor\), var\(--page-floor\)\),\s*url\('\.\.\/assets\/ui-kit\/textures\/parchment\.webp'\)[^;]*;\s*background-blend-mode: lighten, normal;/s.test(
    chronicle,
  );

/** The darkest luminance of a picture's areas, after the veil's floor when there is one. */
async function darkest(file: string, areas: readonly Area[], floor: Rgb | null): Promise<number> {
  const { data, info } = await sharp(`${textures}${file}`)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let least = 1;
  for (const area of areas) {
    for (
      let y = Math.round(area.top * info.height);
      y < Math.round(area.bottom * info.height);
      y++
    ) {
      for (
        let x = Math.round(area.left * info.width);
        x < Math.round(area.right * info.width);
        x++
      ) {
        const at = (y * info.width + x) * 3;
        const pixel: Rgb = [data[at] ?? 0, data[at + 1] ?? 0, data[at + 2] ?? 0];
        const shown = floor
          ? (pixel.map((c, k) => Math.max(c, floor[k] ?? 0)) as unknown as Rgb)
          : pixel;
        least = Math.min(least, luminance(shown));
      }
    }
  }
  return least;
}

describe('the Chronicle’s pages', () => {
  it('lift the parchment under their text to the floor, on the spread and on one page', () => {
    expect(token('page-floor'), '--page-floor in tokens.css').not.toBeNull();
    expect(spreadVeiled, 'the spread’s veils lighten to --page-floor').toBe(true);
    expect(pageVeiled, 'the single page lightens to --page-floor').toBe(true);
  });

  it('give every ink 4.5:1 or better on the darkest parchment under the text', async () => {
    const floor = spreadVeiled && pageVeiled ? token('page-floor') : null;
    const ground = Math.min(
      await darkest('book-spread.webp', textAreas(), floor),
      await darkest('parchment.webp', [{ left: 0, right: 1, top: 0, bottom: 1 }], floor),
    );
    const below = INKS.flatMap((ink) => {
      const colour = token(ink);
      if (!colour) return [`--${ink} is missing`];
      const ratio = contrast(luminance(colour), ground);
      return ratio < 4.5 ? [`--${ink} reads ${ratio.toFixed(2)}:1`] : [];
    });
    expect(below, 'inks under 4.5:1 on the darkest parchment under the text').toEqual([]);
  });

  it('give every ink 5:1 or better on the pages’ mean tone', () => {
    const ground = token('page-ground');
    expect(ground).not.toBeNull();
    if (!ground) return;
    for (const ink of INKS) {
      const colour = token(ink);
      if (!colour) continue;
      expect(contrast(luminance(colour), luminance(ground)), `--${ink}`).toBeGreaterThanOrEqual(5);
    }
  });
});
