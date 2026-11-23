import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The paper scope of the tokens (docs/adr/0075-book-interface.md §1.7): every ink a component may
 * write on a book's page reads at WCAG 2.2 AA on the darkest parchment under the text
 * (--page-floor) and on the page's own tone (--page): 4.5:1 for text and status inks, 3:1 for a
 * field's edge (1.4.11). Measured from the stylesheet itself, so a changed value is measured again.
 */
const css = readFileSync(join(import.meta.dirname, '../../apps/web/src/styles/tokens.css'), 'utf8');

function block(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const body = css.slice(start, css.indexOf('\n}', start));
  const values = new Map<string, string>();
  for (const match of body.matchAll(/(--[\w-]+):\s*([^;]+);/gu)) {
    const [, name, value] = match;
    if (name && value) values.set(name, value.trim());
  }
  return values;
}

const root = block(':root');
const paper = block("[data-surface='paper']");

function resolve(value: string): string {
  const ref = /^var\((--[\w-]+)\)$/u.exec(value);
  if (!ref?.[1]) return value;
  const next = paper.get(ref[1]) ?? root.get(ref[1]);
  if (next === undefined) throw new Error(`Unknown token ${ref[1]}`);
  return resolve(next);
}

type Rgba = readonly [number, number, number, number];

function rgba(value: string): Rgba {
  const hex = /^#([\da-f]{6})$/iu.exec(value)?.[1];
  if (hex) {
    const n = Number.parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgb = /^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/u.exec(value);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Number(rgb[4] ?? 1)];
  throw new Error(`Not a colour: ${value}`);
}

const over = (top: Rgba, ground: Rgba): Rgba => [
  top[0] * top[3] + ground[0] * (1 - top[3]),
  top[1] * top[3] + ground[1] * (1 - top[3]),
  top[2] * top[3] + ground[2] * (1 - top[3]),
  1,
];

function luminance([r, g, b]: Rgba): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const colour = (token: string) => rgba(resolve(token.startsWith('--') ? `var(${token})` : token));

function contrast(ink: string, ground: string): number {
  const g = colour(ground);
  const a = luminance(over(colour(ink), g));
  const b = luminance(g);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const INKS = [
  '--text',
  '--text-muted',
  '--gold',
  '--gold-bright',
  '--teal',
  '--side-party',
  '--side-hostile',
  '--side-neutral',
  '--hp',
  '--hp-low',
  '--danger',
  '--magic',
  '--fire',
  '--k-fact',
  '--k-evidence',
  '--k-testimony',
  '--k-rumor',
  '--k-inference',
  '--k-hypothesis',
  '--k-contradiction',
  '--k-unknown',
  '--k-secret',
];

describe('the paper scope of the tokens', () => {
  it.each(INKS)('%s reads at 4.5:1 on the page and on its darkest parchment', (token) => {
    const value = paper.get(token);
    expect(value, `${token} has a paper value`).toBeDefined();
    for (const ground of ['--page', '--page-floor']) {
      expect(contrast(token, `var(${ground})`), `${token} on ${ground}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it("a field's edge reads at 3:1 on the darkest parchment", () => {
    expect(contrast('--field-edge', 'var(--page-floor)')).toBeGreaterThanOrEqual(3);
  });

  it('text reads at 4.5:1 on the raised glass laid over the paper', () => {
    const glass = over(
      rgba(resolve(paper.get('--glass-raised') ?? '')),
      rgba(resolve('var(--page-floor)')),
    );
    const ink = luminance(rgba(resolve('var(--page-ink-muted)')));
    const ground = luminance(glass);
    expect((ground + 0.05) / (ink + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
});
