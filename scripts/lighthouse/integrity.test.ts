import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir, access } from 'node:fs/promises';
import { expect, it } from 'vitest';
import sharp from 'sharp';

import manifest from '../../campaigns/lighthouse/assets/manifest.json' with { type: 'json' };
import { buildLighthousePackage } from './package.ts';
import { packRoot } from './render-common.ts';

it('ships every illustration with original and runtime bytes matching their provenance', async () => {
  expect(manifest.assets).toHaveLength(30);
  for (const asset of manifest.assets) {
    // PNG originals live outside the repository (the art workspace); checked where present.
    const originalPath = new URL(`assets/${asset.file}`, packRoot);
    if (existsSync(originalPath)) {
      const original = await readFile(originalPath);
      expect(createHash('sha256').update(original).digest('hex'), asset.id).toBe(asset.sha256);
    }
    const runtime = await readFile(new URL(`assets/${asset.runtimeFile}`, packRoot));
    expect(createHash('sha256').update(runtime).digest('hex'), asset.id).toBe(asset.runtimeSha256);
    expect(runtime.length).toBeLessThanOrEqual(1_500_000);
    const metadata = await sharp(runtime).metadata();
    expect(metadata.width).toBe(asset.width);
    expect(metadata.height).toBe(asset.height);
    if (['spool', 'automaton'].includes(asset.id)) expect(metadata.hasAlpha).toBe(true);
  }
});
it('has no broken local links and no DM navigation in player handouts', async () => {
  const files = await readdir(packRoot, { recursive: true });
  for (const relative of files.filter((file) => file.endsWith('.html'))) {
    const path = new URL(relative, packRoot),
      html = await readFile(path, 'utf8');
    for (const match of html.matchAll(/(?:href|src)="([^"#][^"]*)"/g)) {
      const target = new URL(match[1] ?? '', path);
      expect(target.protocol).toBe('file:');
      await expect(access(target), `${relative}: ${target.pathname}`).resolves.toBeUndefined();
    }
    if (relative === 'players.html' || relative.startsWith('handouts/')) {
      expect(html).not.toMatch(/href="[^"]*(?:guide|index|handouts)\.html/);
      expect(html).not.toContain('assets/severin');
    }
  }
  expect(JSON.parse(await readFile(new URL('package.json', packRoot), 'utf8'))).toEqual(
    buildLighthousePackage(),
  );
});
