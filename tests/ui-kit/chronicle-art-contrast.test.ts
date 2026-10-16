import { readFileSync } from 'node:fs';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

/*
 * Words over the Chronicle's GPT pictures read at 4.5:1 or better on every pixel they can sit
 * on (docs/STAGE_320_DESIGN.md §7), measured on the pictures themselves as chronicle.css lays
 * them: a chapter's title and its "New" mark on the red ribbon of its tab, under the black the
 * stylesheet lays across the ribbon's middle at the lightest shade any tab takes; and the
 * book's title on the candle-lit desk under the shade over the desk's top edge, whatever part
 * of the desk lies there (taken at its brightest: white).
 */
const styles = new URL('../../apps/web/src/styles/', import.meta.url).pathname;
const ornaments = new URL('../../apps/web/src/assets/ui-kit/ornaments/', import.meta.url).pathname;
const tokens = readFileSync(`${styles}tokens.css`, 'utf8');
const chronicle = readFileSync(`${styles}chronicle.css`, 'utf8');

type Rgb = readonly [number, number, number];

function token(name: string): Rgb {
  const hex = new RegExp(`--${name}:\\s*#([0-9a-f]{6});`).exec(tokens)?.[1];
  if (!hex) throw new Error(`--${name} is not a colour in tokens.css`);
  const value = Number.parseInt(hex, 16);
  return [value >> 16, (value >> 8) & 255, value & 255];
}

const linear = (channel: number) => {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: Rgb) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
const contrast = (a: Rgb, b: Rgb) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/** A colour at `alpha` over another, as the browser composites them (8-bit sRGB). */
const over = (top: Rgb, alpha: number, under: Rgb): Rgb =>
  under.map((channel, k) => Math.round((top[k] ?? 0) * alpha + channel * (1 - alpha))) as [
    number,
    number,
    number,
  ];

/** The rule's block for an exact selector in chronicle.css. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`).exec(chronicle)?.[1];
  if (block === undefined) throw new Error(`chronicle.css has no rule for ${selector}`);
  return block;
}

/** A length in rem from a declaration of the rule, e.g. `max-width: 15rem`. */
function rem(block: string, pattern: RegExp): number {
  const value = Number(pattern.exec(block)?.[1]);
  if (!Number.isFinite(value)) throw new Error(`chronicle.css: ${pattern.source} is gone`);
  return value;
}

describe('the chapter ribbons', () => {
  const shades = [...chronicle.matchAll(/--ribbon-shade: ([\d.]+);/g)].map((m) => Number(m[1]));
  const band = /rgb\(0 0 0 \/ var\(--ribbon-shade\)\) ([\d.]+)% ([\d.]+)%/.exec(chronicle);
  const tab = rule('.book-ribbon');
  const ribbon = rule('.book-ribbon::before');
  /*
   * Where the words can lie on the ribbon, as fractions of the picture: across it, the one
   * centred line of the tab; along it, from the tab's left padding at its widest to its right
   * padding before the swallowtail, whose points lie on the tab's right edge.
   */
  const breadth = rem(tab, /--ribbon-b: ([\d.]+)rem;/);
  const length = (breadth * 984) / 160;
  const points = 0.5 + rem(ribbon, /var\(--ribbon-l\) \* ([\d.]+)\)/);
  const [, right, left] = /padding: 0 ([\d.]+)rem 0 ([\d.]+)rem;/.exec(tab) ?? [];
  const words = {
    across: (breadth - rem(tab, /line-height: ([\d.]+);/)) / 2 / breadth,
    from: points - (rem(tab, /max-width: ([\d.]+)rem;/) - Number(left)) / length,
    to: points - Number(right) / length,
  };

  it('lay the GPT ribbon under each tab, shaded across the middle where its words lie', () => {
    expect(ribbon).toMatch(/url\('\.\.\/assets\/ui-kit\/ornaments\/ribbon\.webp'\)/);
    expect(shades.length, '--ribbon-shade for a tab and for the chapter shown').toBeGreaterThan(1);
    expect(band, 'the shade spans the middle of the ribbon').not.toBeNull();
    expect(words.across, 'the line of words lies inside the shade').toBeGreaterThanOrEqual(
      Number(band?.[1]) / 100,
    );
    expect(words.from, 'the widest tab begins on the ribbon').toBeGreaterThan(0);
    expect(words.to, 'the words end before the swallowtail').toBeLessThan(points);
  });

  it('give the words 4.5:1 or better on every pixel of the shaded middle', async () => {
    const lightest = Math.min(...shades);
    const [start, end] = [Number(band?.[1]) / 100, Number(band?.[2]) / 100];
    const { data, info } = await sharp(`${ornaments}ribbon.webp`)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    // The swallowtail's inner point: no word may reach it.
    let apex = info.height - 1;
    while (apex > 0 && (data[(apex * info.width + (info.width >> 1)) * 4 + 3] ?? 0) < 128) apex--;
    expect(words.to * info.height, 'the words end before the inner point').toBeLessThan(apex);
    let brightest: Rgb = [0, 0, 0];
    let clear = 0;
    for (let y = Math.floor(words.from * info.height); y < Math.ceil(words.to * info.height); y++) {
      for (let x = Math.ceil(start * info.width); x < Math.floor(end * info.width); x++) {
        const at = (y * info.width + x) * 4;
        if ((data[at + 3] ?? 0) < 255) clear++;
        const shown = over([0, 0, 0], lightest, [
          data[at] ?? 0,
          data[at + 1] ?? 0,
          data[at + 2] ?? 0,
        ]);
        if (luminance(shown) > luminance(brightest)) brightest = shown;
      }
    }
    expect(clear, 'the ribbon is opaque wherever its words lie').toBe(0);
    for (const ink of ['text']) {
      const ratio = contrast(token(ink), brightest);
      expect(ratio, `--${ink} on the brightest pixel under the words`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('the desk under the book', () => {
  it('shades its top edge so the book’s title reads on any part of the desk', () => {
    const frame = rule('.chronicle-frame');
    expect(frame).toMatch(/url\('\.\.\/assets\/ui-kit\/textures\/chronicle-desk\.webp'\)/);
    const shade = /color-mix\(in srgb, var\(--ink-950\) ([\d.]+)%, transparent\) ([\d.]+)rem/.exec(
      frame,
    );
    expect(shade, 'a shade of --ink-950 over the desk’s top edge').not.toBeNull();
    // The title's line lies within the shade at full strength: the frame's top padding (10 px)
    // and the header's 44 px.
    expect(Number(shade?.[2]) * 16).toBeGreaterThanOrEqual(10 + 44);
    const title = rule('.book-header h2');
    expect(title).toMatch(/color: var\(--gold-bright\);/);
    const ground = over(token('ink-950'), Number(shade?.[1]) / 100, [255, 255, 255]);
    expect(contrast(token('gold-bright'), ground)).toBeGreaterThanOrEqual(4.5);
  });
});
