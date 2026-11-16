import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * A browser journey that opens contexts of its own closes them (`tests/e2e/support/journey.ts`).
 * Playwright closes only the `page` fixture's context, so a spec that takes the worker's `browser`
 * either takes its `test` from `support/journey.ts`, which closes what the journey opened, or
 * closes its pages itself with `closePages` (`support/pages.ts`).
 */
const SPECS = fileURLToPath(new URL('../e2e/', import.meta.url));
const TAKES_BROWSER = /\bbrowser\b/;
const CLOSES = /from '\.\/support\/journey\.ts'|\bclosePages\b/;
/**
 * Specs written on another branch before this rule (Stage 750, pull request 32): named here so
 * that branch and this one merge in either order. Each takes the journey `test` when it lands.
 */
const NOT_YET = new Set(['display-room.spec.ts', 'native-polish.spec.ts']);

describe('browser journeys', () => {
  it('close the pages they open', () => {
    const specs = readdirSync(SPECS).filter((name) => name.endsWith('.spec.ts'));
    expect(specs.length).toBeGreaterThan(100);
    const leaving = specs.filter((name) => {
      const source = readFileSync(`${SPECS}${name}`, 'utf8');
      return !NOT_YET.has(name) && TAKES_BROWSER.test(source) && !CLOSES.test(source);
    });
    expect(leaving).toEqual([]);
  });
});
