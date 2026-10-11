import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Test support stays out of production (docs/adr/0032-live-ai.md, checkpoint B1): no source
 * outside tests and `testing/` folders imports a `testing/` module, so a test-only provider brand
 * (`packages/ai/src/testing/providers.ts`) or fake can never reach runtime composition.
 */
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SOURCE = /\.(ts|tsx)$/;
const TEST = /\.test\.(ts|tsx)$/;

async function productionSources(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['testing', 'node_modules', 'dist'].includes(entry.name)) {
        found.push(...(await productionSources(path)));
      }
    } else if (SOURCE.test(entry.name) && !TEST.test(entry.name)) found.push(path);
  }
  return found;
}

describe('test support imports', () => {
  it('never reach production sources', async () => {
    const roots = (
      await Promise.all(
        ['apps', 'packages'].map(async (parent) =>
          (await readdir(join(ROOT, parent), { withFileTypes: true }))
            .filter((entry) => entry.isDirectory())
            .map((entry) => join(ROOT, parent, entry.name, 'src')),
        ),
      )
    ).flat();
    const offenders: string[] = [];
    for (const root of roots) {
      for (const path of await productionSources(root).catch(() => [])) {
        const text = await readFile(path, 'utf8');
        for (const match of text.matchAll(/(?:from|import\()\s*['"]([^'"]+)['"]/g)) {
          const specifier = match[1] ?? '';
          if (specifier.startsWith('.') && specifier.split('/').includes('testing')) {
            offenders.push(`${relative(ROOT, path).split(sep).join('/')} -> ${specifier}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
