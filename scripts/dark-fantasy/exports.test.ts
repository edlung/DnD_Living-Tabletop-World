import { readFile, readdir, stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { COLLECTION_ROOT, SLUGS, loadSource } from './source.ts';

describe.each(SLUGS)('%s local reader exports', (slug) => {
  it('keeps navigation/downloads inside the pack and resolves every link', async () => {
    const root = new URL(`${slug}/`, COLLECTION_ROOT);
    const files = (await readdir(root)).filter((f) => f.endsWith('.html'));
    for (const file of await readdir(new URL('handouts/', root)))
      if (file.endsWith('.html')) files.push(`handouts/${file}`);
    for (const file of files) {
      const url = new URL(file, root);
      const html = await readFile(url, 'utf8');
      expect(html).toContain('<html lang="ru">');
      expect(html).not.toMatch(/<script\b/);
      if (file === 'players.html' || file.startsWith('handouts/')) {
        expect(html).toContain('<style>');
        expect(html).not.toContain('<link rel="stylesheet"');
      }
      for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        if (!match[1] || match[1].startsWith('#')) continue;
        const target = new URL(match[1], url);
        expect(
          target.href.startsWith(COLLECTION_ROOT.href),
          `${slug}/${file}: ${target.href}`,
        ).toBe(true);
        expect((await stat(target)).isFile()).toBe(true);
      }
    }
    const source = await loadSource(slug);
    const expectedMaps = source.encounters.flatMap((e) =>
      [3, 4, 5, 6, 7].map((size) => `${e.key}-${size}.svg`),
    );
    expect(
      (await readdir(new URL('maps/', root))).filter((f) => f.endsWith('.svg')).sort(),
    ).toEqual(expectedMaps.sort());
    expect(files.filter((f) => /^session-\d\.html$/.test(f))).toHaveLength(8);
    expect(files.filter((f) => f.startsWith('handouts/'))).toHaveLength(source.handouts.length);
    const defaultPackage = await readFile(new URL('package.json', root), 'utf8');
    expect(defaultPackage).toBe(await readFile(new URL('variants/4-players.json', root), 'utf8'));
  });
});
