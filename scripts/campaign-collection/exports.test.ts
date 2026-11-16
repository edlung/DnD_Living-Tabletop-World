import { access, readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { COLLECTION_ROOT, SLUGS, loadSource } from './source.ts';
import { esc } from './render-common.ts';

describe.each(SLUGS)('%s delivered local books', (slug) => {
  it('resolves every local link and keeps handout conditions off released pages', async () => {
    const root = new URL(`${slug}/`, COLLECTION_ROOT);
    const source = await loadSource(slug);
    const pages = (await readdir(root)).filter((name) => name.endsWith('.html'));
    pages.push(
      ...(await readdir(new URL('handouts/', root)))
        .filter((name) => name.endsWith('.html'))
        .map((name) => `handouts/${name}`),
    );
    expect(pages.length).toBe(3 + source.sessions.length + source.handouts.length);
    for (const name of pages) {
      const url = new URL(name, root);
      const html = await readFile(url, 'utf8');
      expect(html).toContain('lang="ru"');
      expect(html).not.toContain('<script');
      for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        const target = match[1];
        if (!target || target.startsWith('#')) continue;
        const linked = new URL(target, url);
        expect(linked.protocol).toBe('file:');
        await expect(access(linked), `${name} → ${target}`).resolves.toBeUndefined();
      }
    }
    for (const handout of source.handouts) {
      const html = await readFile(new URL(`handouts/${handout.key}.html`, root), 'utf8');
      expect(html).toContain(esc(handout.text));
      expect(html).not.toContain(esc(handout.unlock));
      expect(html).not.toContain('href="../index.html"');
      expect(html).toContain('<style>');
      expect(html).not.toContain('rel="stylesheet"');
    }
    const playerPage = await readFile(new URL('players.html', root), 'utf8');
    expect(playerPage).toContain('<style>');
    expect(playerPage).not.toContain('rel="stylesheet"');
    for (const secret of [...source.world.truth, ...source.cast.npcs.map((n) => n.secret)])
      expect(playerPage).not.toContain(esc(secret));
  });
});
